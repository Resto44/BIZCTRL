-- Owner requests remain pending until the linked beneficiary approves. Existing posted history is unchanged.
ALTER TABLE public.erp_bank_wallet_requests ADD COLUMN IF NOT EXISTS initiated_by_owner boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.erp_bank_wallet_owner_transfer(
 p_person uuid,p_kind text,p_amount numeric,p_currency text,p_request_id uuid,
 p_treasury_account uuid,p_note text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 r public.erp_bank_wallet_requests; p public.business_partners; a public.treasury_accounts;
 v_account uuid; v_balance numeric; v_treasury_available numeric;
 v_funding boolean;
BEGIN
 IF auth.uid() IS NULL OR p_person IS NULL OR p_request_id IS NULL OR p_treasury_account IS NULL
 OR p_kind IS NULL OR p_kind NOT IN ('fund_wallet','return_to_owner')
 OR p_amount IS NULL OR p_amount<=0 OR p_amount>10000000 OR p_amount<>round(p_amount,2)
 OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
 OR length(trim(coalesce(p_note,'')))<8 OR length(p_note)>500
 THEN RAISE EXCEPTION 'WALLET_REQUEST_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM public.business_partners WHERE id=p_person FOR SHARE;
 IF NOT FOUND OR NOT coalesce(public.treasury_account_is_owner(p.restaurant_id),false)
 OR NOT p.is_active OR p.user_id IS NULL OR p.user_id=auth.uid() OR NOT EXISTS(
 SELECT 1 FROM public.restaurants WHERE id=p.restaurant_id AND coalesce(is_active,true))
 THEN RAISE EXCEPTION 'WALLET_OWNER_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 -- Concurrent retries serialize before inspecting the idempotency key.
 PERFORM pg_advisory_xact_lock(hashtextextended('bank-wallet-owner-request:'||p_request_id,0));
 SELECT * INTO r FROM public.erp_bank_wallet_requests WHERE id=p_request_id FOR UPDATE;
 IF FOUND THEN
  IF r.initiated_by_owner AND r.created_by=auth.uid()
   AND r.restaurant_id=p.restaurant_id AND r.person_id=p_person AND r.kind=p_kind
   AND r.amount=p_amount AND r.currency=p_currency AND r.note=trim(p_note)
   AND r.owner_treasury_account_id=p_treasury_account THEN RETURN r.id; END IF;
  RAISE EXCEPTION 'WALLET_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
 END IF;
 INSERT INTO public.erp_bank_wallet_requests(id,restaurant_id,person_id,kind,amount,currency,note,created_by,initiated_by_owner,owner_treasury_account_id)
 VALUES(p_request_id,p.restaurant_id,p_person,p_kind,p_amount,p_currency,trim(p_note),auth.uid(),true,p_treasury_account)
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
 -- No journal or Treasury movement until counterparty approval.
 RETURN r.id;
END;$$;
REVOKE ALL ON FUNCTION public.erp_bank_wallet_owner_transfer(uuid,text,numeric,text,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_bank_wallet_owner_transfer(uuid,text,numeric,text,uuid,uuid,text) TO authenticated;


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
 SELECT * INTO p FROM public.business_partners WHERE id=r.person_id FOR SHARE;
 IF NOT FOUND OR NOT p.is_active OR p.restaurant_id<>r.restaurant_id OR
  NOT EXISTS(SELECT 1 FROM public.restaurants WHERE id=r.restaurant_id AND coalesce(is_active,true)) THEN
  RAISE EXCEPTION 'WALLET_ACCOUNT_INACTIVE' USING ERRCODE='42501'; END IF;
 IF r.initiated_by_owner THEN
  -- Neither the creator nor another owner can approve on the beneficiary's behalf.
  IF p.user_id IS DISTINCT FROM auth.uid() OR r.created_by=auth.uid() THEN
   RAISE EXCEPTION 'WALLET_BENEFICIARY_APPROVAL_REQUIRED' USING ERRCODE='42501'; END IF;
  -- The beneficiary approves the exact account selected by the owner, never substitutes one.
  IF p_treasury_account IS NOT NULL AND p_treasury_account IS DISTINCT FROM r.owner_treasury_account_id THEN
   RAISE EXCEPTION 'WALLET_TREASURY_ACCOUNT_INVALID' USING ERRCODE='42501'; END IF;
  p_treasury_account:=r.owner_treasury_account_id;
 ELSE
  IF NOT coalesce(public.treasury_account_is_owner(r.restaurant_id),false) OR r.created_by=auth.uid() THEN
   RAISE EXCEPTION 'WALLET_OWNER_APPROVAL_REQUIRED' USING ERRCODE='42501'; END IF;
 END IF;
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

REVOKE ALL ON FUNCTION public.erp_bank_wallet_review(uuid,boolean,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_bank_wallet_review(uuid,boolean,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.erp_bank_wallet_dashboard(
 p_person uuid, p_limit integer DEFAULT 30
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE
 p public.business_partners;
 v_business text;
 v_owner boolean;
 v_wallet jsonb;
 v_history jsonb;
 v_pending jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_person IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'WALLET_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM public.business_partners WHERE id=p_person;
 IF NOT FOUND OR NOT p.is_active OR NOT EXISTS(
  SELECT 1 FROM public.restaurants WHERE id=p.restaurant_id AND coalesce(is_active,true)
 ) THEN RAISE EXCEPTION 'WALLET_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 v_owner:=coalesce(public.treasury_account_is_owner(p.restaurant_id),false);
 IF NOT v_owner AND p.user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'WALLET_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT name INTO v_business FROM public.restaurants WHERE id=p.restaurant_id;
 SELECT coalesce(jsonb_agg(x ORDER BY x.currency),'[]'::jsonb) INTO v_wallet
 FROM (
  -- Include currencies of pending requests before the first approved posting.
  -- Account balances MUST still come solely from posted person-side entries.
  SELECT c.currency,a.id,coalesce(a.status,'active') status,
   coalesce(j.balance,0) balance,coalesce(pr.pending_amount,0) pending_amount,
   coalesce(j.transfers_in,0) transfers_in,coalesce(j.transfers_out,0) transfers_out
  FROM (
   SELECT currency FROM public.erp_bank_wallet_accounts
    WHERE restaurant_id=p.restaurant_id AND person_id=p.id
   UNION
   SELECT currency FROM public.erp_bank_wallet_requests
    WHERE restaurant_id=p.restaurant_id AND person_id=p.id
  )c
  LEFT JOIN public.erp_bank_wallet_accounts a ON
   a.restaurant_id=p.restaurant_id AND a.person_id=p.id AND a.currency=c.currency
  LEFT JOIN LATERAL (
   SELECT coalesce(sum(signed_amount) FILTER(WHERE side='person'),0) balance,
    coalesce(sum(signed_amount) FILTER(WHERE side='person' AND signed_amount>0),0) transfers_in,
    -coalesce(sum(signed_amount) FILTER(WHERE side='person' AND signed_amount<0),0) transfers_out
   FROM public.erp_bank_wallet_postings WHERE wallet_account_id=a.id
  )j ON true
  LEFT JOIN LATERAL (
   SELECT coalesce(sum(amount),0) pending_amount
   FROM public.erp_bank_wallet_requests
   WHERE restaurant_id=p.restaurant_id AND person_id=p.id
    AND currency=c.currency AND status='pending'
  )pr ON true
 )x;
 -- Compute the full ledger first. Pagination must never reset the running balance.
 WITH ledger AS (
  SELECT j.request_id,j.id posting_id,j.posted_at,j.signed_amount,
   sum(j.signed_amount) OVER (
    PARTITION BY j.wallet_account_id,j.currency ORDER BY j.posted_at,j.id
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
   ) balance_after
  FROM public.erp_bank_wallet_postings j
  JOIN public.erp_bank_wallet_accounts a ON a.id=j.wallet_account_id
  WHERE a.person_id=p.id AND a.restaurant_id=p.restaurant_id AND j.side='person'
 )
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.activity_at DESC,x.posting_id DESC NULLS LAST,x.id DESC),'[]'::jsonb)
 INTO v_history FROM (
  SELECT r.id,r.kind,r.amount,r.currency,r.status,r.note,r.created_at,
   r.reviewed_at,r.review_note,r.treasury_transaction_id,r.initiated_by_owner,
   (CASE WHEN r.kind='fund_wallet' THEN v_business ELSE p.name END) payer,
   (CASE WHEN r.kind='fund_wallet' THEN p.name ELSE v_business END) payee,
   CASE WHEN r.status='posted' THEN j.signed_amount ELSE 0 END wallet_delta,
   j.posted_at,j.posting_id,coalesce(j.posted_at,r.created_at) activity_at,
   j.balance_after-j.signed_amount balance_before,j.balance_after
  FROM public.erp_bank_wallet_requests r
  LEFT JOIN ledger j ON j.request_id=r.id AND r.status='posted'
  WHERE r.restaurant_id=p.restaurant_id AND r.person_id=p.id
  ORDER BY coalesce(j.posted_at,r.created_at) DESC,j.posting_id DESC NULLS LAST,r.id DESC LIMIT p_limit
 )x;
 -- Separate queue: pending approvals must not disappear behind the 100-row history limit.
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'kind',r.kind,'amount',r.amount,'currency',r.currency,'status',r.status,
  'note',r.note,'created_at',r.created_at,'initiated_by_owner',r.initiated_by_owner,
  'payer',CASE WHEN r.kind='fund_wallet' THEN v_business ELSE p.name END,
  'payee',CASE WHEN r.kind='fund_wallet' THEN p.name ELSE v_business END
 ) ORDER BY r.created_at,r.id),'[]'::jsonb) INTO v_pending
 FROM public.erp_bank_wallet_requests r
 WHERE r.person_id=p.id AND r.restaurant_id=p.restaurant_id AND r.status='pending';
 RETURN jsonb_build_object('person_id',p.id,
  'account_reference','WLT-'||upper(replace(p.id::text,'-','')),
  'person_name',p.name,'business_name',v_business,
  'restaurant_id',p.restaurant_id,'is_owner',v_owner,
  'currencies',coalesce(v_wallet,'[]'::jsonb),
  'transactions',coalesce(v_history,'[]'::jsonb),'pending_requests',v_pending,
  'legacy_migration','historical_loans_and_custody_archived_not_spendable',
  'generated_at',clock_timestamp());
END;$$;

REVOKE ALL ON FUNCTION public.erp_bank_wallet_dashboard(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_bank_wallet_dashboard(uuid,integer) TO authenticated;
DO $validation$
BEGIN
 BEGIN
  DECLARE u uuid:=gen_random_uuid(); pu uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); tenant uuid; person uuid:=gen_random_uuid();
 cash uuid:=gen_random_uuid(); usd uuid:=gen_random_uuid(); tx uuid:=gen_random_uuid(); rtn uuid:=gen_random_uuid(); req uuid:=gen_random_uuid();
 snap jsonb; full_history jsonb; denied boolean; n integer;
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
 (u,'wallet-owner-qa-'||u||'@example.invalid',now(),'{"role":"owner","full_name":"QA","company_name":"Wallet rollback QA","branch_name":"QA","business_type":"services"}');
 SELECT restaurant_id INTO tenant FROM public.erp_memberships WHERE user_id=u LIMIT 1;
 ASSERT tenant IS NOT NULL,'fixture tenant missing';
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
 (pu,'wallet-person-qa-'||pu||'@example.invalid',now(),'{"people_portal_registration":true}'),
 (outsider,'wallet-outsider-qa-'||outsider||'@example.invalid',now(),'{"people_portal_registration":true}');
 INSERT INTO public.business_partners(id,restaurant_id,name,email,user_id,created_by) VALUES
 (person,tenant,'Wallet QA','wallet-person-qa-'||pu||'@example.invalid',pu,u);
 INSERT INTO public.treasury_accounts(id,restaurant_id,account_name,account_type,currency,opening_balance) VALUES
 (cash,tenant,'QA cash','cash','SAR',100),(usd,tenant,'QA USD','cash','USD',100);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','wallet-owner-qa-'||u||'@example.invalid','role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',40,'SAR',tx,cash,'Owner funding QA');
 PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',40,'SAR',tx,cash,'Owner funding QA');

 snap:=public.erp_bank_wallet_owner_overview(tenant,'SAR');
 ASSERT (snap->'summary'->>'wallet_balance')::numeric=0,'pending owner request moved wallet funds';
 ASSERT (SELECT (x->>'available_balance')::numeric FROM jsonb_array_elements(snap->'accounts')x WHERE x->>'id'=cash::text)=100,'pending owner request moved treasury funds';
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_review(tx,true,cash,'Self approval QA'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;ASSERT denied,'owner self approval accepted';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_review(tx,true,NULL,'Outsider approval QA'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;ASSERT denied,'outsider approval accepted';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',pu,'email','wallet-person-qa-'||pu||'@example.invalid','role','authenticated')::text,true);
 snap:=public.erp_bank_wallet_dashboard(person,1);
 ASSERT jsonb_array_length(snap->'pending_requests')=1,'missing beneficiary queue';
 ASSERT (snap->'pending_requests'->0->>'initiated_by_owner')::boolean,'missing origin flag';
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_review(tx,true,usd,'Changed account QA'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;ASSERT denied,'beneficiary changed treasury account';
 PERFORM public.erp_bank_wallet_review(tx,true,NULL,'Beneficiary approves funding');
 PERFORM public.erp_bank_wallet_review(tx,true,NULL,'Beneficiary approves funding');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','wallet-owner-qa-'||u||'@example.invalid','role','authenticated')::text,true); PERFORM public.erp_bank_wallet_owner_transfer(person,'return_to_owner',10,'SAR',rtn,cash,'Owner return QA');
 snap:=public.erp_bank_wallet_owner_overview(tenant,'SAR');
 ASSERT (snap->'summary'->>'wallet_balance')::numeric=40,'pending return debited wallet';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',pu,'email','wallet-person-qa-'||pu||'@example.invalid','role','authenticated')::text,true);
 PERFORM public.erp_bank_wallet_review(rtn,true,NULL,'Beneficiary approves return');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','wallet-owner-qa-'||u||'@example.invalid','role','authenticated')::text,true);
 SET CONSTRAINTS ALL IMMEDIATE;
 SET CONSTRAINTS ALL DEFERRED;
 snap:=public.erp_bank_wallet_owner_overview(tenant,'SAR');
 ASSERT (snap->'summary'->>'wallet_balance')::numeric=30,'wrong wallet total';
 ASSERT (SELECT (x->>'available_balance')::numeric FROM jsonb_array_elements(snap->'accounts')x WHERE x->>'id'=cash::text)=70,'wrong treasury total';
 ASSERT (snap->>'total')::int=2,'duplicate request posted';
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',41,'SAR',tx,cash,'Owner funding QA'); EXCEPTION WHEN unique_violation THEN denied:=true; END;ASSERT denied,'changed replay accepted';
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',71,'SAR',gen_random_uuid(),cash,'Insufficient QA'); EXCEPTION WHEN numeric_value_out_of_range THEN denied:=true; END;ASSERT denied,'treasury overspend';
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_owner_transfer(person,'return_to_owner',31,'SAR',gen_random_uuid(),cash,'Insufficient QA'); EXCEPTION WHEN numeric_value_out_of_range THEN denied:=true; END;ASSERT denied,'wallet overspend';
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',1,'SAR',gen_random_uuid(),usd,'Wrong currency QA'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;ASSERT denied,'currency mismatch allowed';
 RESET ROLE;
 UPDATE public.erp_bank_wallet_accounts SET status='frozen' WHERE person_id=person;
 SET LOCAL ROLE authenticated;
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',1,'SAR',gen_random_uuid(),cash,'Frozen wallet QA'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;ASSERT denied,'frozen wallet accepted';
 RESET ROLE;
 UPDATE public.erp_bank_wallet_accounts SET status='active' WHERE person_id=person;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',pu,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',1,'SAR',gen_random_uuid(),cash,'Person attack QA'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;ASSERT denied,'person can post owner transaction';
 PERFORM public.erp_bank_wallet_request(person,'fund_wallet',5,'SAR',req,'Beneficiary request QA');
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_owner_overview(tenant,'SAR'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;ASSERT denied,'tenant overview leak';
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',1,'SAR',gen_random_uuid(),cash,'Outsider attack QA'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;ASSERT denied,'outsider transfer accepted';
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 snap:=public.erp_bank_wallet_owner_overview(tenant,'SAR','pending');
 ASSERT (snap->>'total')::int=1 AND (snap->'summary'->>'wallet_balance')::numeric=30,'pending affects balance';
 snap:=public.erp_bank_wallet_owner_timeline(tenant,'SAR','pending');
 ASSERT (snap->>'total')::int=1,'pending timeline count';
 ASSERT snap->'transactions'->0->>'balance_after' IS NULL,'pending fabricated balance';
 PERFORM public.erp_bank_wallet_review(req,true,cash,'Approve beneficiary QA');
 SET CONSTRAINTS ALL IMMEDIATE;
 SET CONSTRAINTS ALL DEFERRED;
 snap:=public.erp_bank_wallet_owner_overview(tenant,'SAR');
 ASSERT (snap->'summary'->>'wallet_balance')::numeric=35,'review regression';
 full_history:=public.erp_bank_wallet_owner_timeline(tenant,'SAR');
 snap:=public.erp_bank_wallet_owner_timeline(tenant,'SAR','incoming',0,'','Asia/Riyadh','Wallet QA');
 ASSERT (snap->>'total')::int=1,'incoming filter';
 ASSERT snap->'transactions'->0->'balance_after'=(SELECT x->'balance_after' FROM jsonb_array_elements(full_history->'transactions')x WHERE x->>'id'=rtn::text),'filter corrupts running balance';
 ASSERT (snap->'transactions'->0->>'balance_before')::numeric-(snap->'transactions'->0->>'balance_after')::numeric=10,'return balance delta';
 ASSERT snap->'transactions'->0->>'activity_day'=to_char(now() AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD'),'local day mismatch';
 snap:=public.erp_bank_wallet_owner_timeline(tenant,'SAR','outgoing');
 ASSERT (snap->>'total')::int=2,'outgoing filter';
 snap:=public.erp_bank_wallet_owner_timeline(tenant,'SAR','all',50);
 ASSERT (snap->>'total')::int=3 AND jsonb_array_length(snap->'transactions')=0,'pagination count';
 snap:=public.erp_bank_wallet_owner_timeline(tenant,'SAR','all',0,'1900-01');
 ASSERT (snap->>'total')::int=0,'month filter';
 RESET ROLE;
 SELECT count(*) INTO n FROM public.erp_bank_wallet_postings WHERE restaurant_id=tenant;ASSERT n=6,'wrong double entry count';
 ASSERT (SELECT sum(signed_amount) FROM public.erp_bank_wallet_postings WHERE restaurant_id=tenant)=0,'unbalanced ledger';
 ASSERT NOT EXISTS(SELECT 1 FROM public.daily_sales WHERE restaurant_id=tenant::text),'wallet created sales';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_owner_timeline(tenant,'SAR'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;ASSERT denied,'timeline tenant leak';
 RESET ROLE;

 -- Rejection leaves both ledgers unchanged. Replaying submission cannot resurrect it.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','wallet-owner-qa-'||u||'@example.invalid','role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 req:=gen_random_uuid();
 PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',5,'SAR',req,cash,'Rejection testing');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',pu,'email','wallet-person-qa-'||pu||'@example.invalid','role','authenticated')::text,true);
 PERFORM public.erp_bank_wallet_review(req,false,NULL,'Beneficiary rejects transfer');
 PERFORM public.erp_bank_wallet_review(req,false,NULL,'Beneficiary rejects transfer');
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_review(req,true,NULL,'Approve rejected transfer'); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;ASSERT denied,'rejected request posted';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','wallet-owner-qa-'||u||'@example.invalid','role','authenticated')::text,true);
 PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',5,'SAR',req,cash,'Rejection testing');
 snap:=public.erp_bank_wallet_owner_overview(tenant,'SAR');
 ASSERT (snap->'summary'->>'wallet_balance')::numeric=35,'rejection affected funds';
 -- Two individually valid pending requests cannot spend the same balance twice.
 tx:=gen_random_uuid();rtn:=gen_random_uuid();
 PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',60,'SAR',tx,cash,'Pending funding one');
 PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',60,'SAR',rtn,cash,'Pending funding two');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',pu,'email','wallet-person-qa-'||pu||'@example.invalid','role','authenticated')::text,true);
 snap:=public.erp_bank_wallet_dashboard(person,1);
 ASSERT jsonb_array_length(snap->'pending_requests')=2,'pending queue truncated by history limit';
 PERFORM public.erp_bank_wallet_review(tx,true,NULL,'Approve first funding');
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_review(rtn,true,NULL,'Approve second funding'); EXCEPTION WHEN numeric_value_out_of_range THEN denied:=true; END;ASSERT denied,'approval failed to recheck treasury funds';
 PERFORM public.erp_bank_wallet_review(rtn,false,NULL,'Reject unfunded request');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','wallet-owner-qa-'||u||'@example.invalid','role','authenticated')::text,true);
 tx:=gen_random_uuid();rtn:=gen_random_uuid();
 PERFORM public.erp_bank_wallet_owner_transfer(person,'return_to_owner',90,'SAR',tx,cash,'Pending return one');
 PERFORM public.erp_bank_wallet_owner_transfer(person,'return_to_owner',90,'SAR',rtn,cash,'Pending return two');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',pu,'email','wallet-person-qa-'||pu||'@example.invalid','role','authenticated')::text,true);
 PERFORM public.erp_bank_wallet_review(tx,true,NULL,'Approve first return');
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_review(rtn,true,NULL,'Approve second return'); EXCEPTION WHEN numeric_value_out_of_range THEN denied:=true; END;ASSERT denied,'approval failed to recheck beneficiary funds';
 PERFORM public.erp_bank_wallet_review(rtn,false,NULL,'Reject unfunded return');
 RESET ROLE;
 SET CONSTRAINTS ALL IMMEDIATE;
 ASSERT (SELECT count(*) FROM public.erp_bank_wallet_postings WHERE restaurant_id=tenant)=10,'duplicate approval postings';
 ASSERT (SELECT sum(signed_amount) FROM public.erp_bank_wallet_postings WHERE restaurant_id=tenant)=0,'unbalanced approval ledger';
 ASSERT (SELECT count(*) FROM public.wallet_transactions WHERE restaurant_id=tenant)=5,'wrong treasury posting count';
 ASSERT NOT has_function_privilege('anon','public.erp_bank_wallet_owner_transfer(uuid,text,numeric,text,uuid,uuid,text)','execute'),'anonymous grant';
END;
  RAISE EXCEPTION 'rollback approval test fixtures' USING ERRCODE='ZX001';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
END $validation$;
