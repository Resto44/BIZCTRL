-- Branch managers may fund their own closing using scoped wallets. General treasury privileges remain owner-only.
CREATE OR REPLACE FUNCTION closing_funding_private.can_fund(r uuid,b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT auth.uid() IS NOT NULL
 AND coalesce(public.erp_can_access_scope_text(r::text,b::text),false)
 AND EXISTS(SELECT 1 FROM public.erp_memberships m WHERE m.user_id=auth.uid()
 AND m.restaurant_id=r AND m.status='approved'
 AND (m.role='owner' OR (m.role='manager' AND m.branch_id=b)));
$fn$;
REVOKE ALL ON FUNCTION closing_funding_private.can_fund(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.erp_closing_funding_accounts(p_restaurant uuid, p_branch uuid, p_currency text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb; b public.branches;
BEGIN
 IF NOT closing_funding_private.can_fund(p_restaurant,p_branch) THEN
 RAISE EXCEPTION 'CLOSING_FUNDING_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO b FROM public.branches WHERE id=p_branch AND restaurant_id=p_restaurant;
 IF NOT FOUND THEN RAISE EXCEPTION 'CLOSING_FUNDING_BRANCH_INVALID'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO result FROM (
 SELECT a.id,a.account_name,a.account_type,a.currency,a.branch_id,a.branch_key,a.legacy_wallet_key,a.is_system,
 a.opening_balance+coalesce(sum(CASE WHEN t.direction='in' THEN t.amount WHEN t.direction='out' THEN -t.amount ELSE 0 END),0) AS available_balance
 FROM public.treasury_accounts a LEFT JOIN public.wallet_transactions t ON t.account_id=a.id AND t.restaurant_id=a.restaurant_id
 WHERE a.restaurant_id=p_restaurant AND a.is_active AND a.currency=p_currency
 AND ((a.branch_id IS NULL AND a.branch_key IS NULL) OR a.branch_id=p_branch OR (a.branch_id IS NULL AND a.branch_key=b.branch_key))
 GROUP BY a.id ORDER BY a.id
 ) x;
 RETURN result;
END;$function$;
CREATE OR REPLACE FUNCTION closing_funding_private.prepare_register(p_restaurant uuid, p_branch uuid, p_date date)
 RETURNS public.daily_cash_settlements
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE b public.branches; s public.daily_cash_settlements; opening numeric:=0;
BEGIN
 IF NOT closing_funding_private.can_fund(p_restaurant,p_branch) THEN
  RAISE EXCEPTION 'Cash register owner permission required' USING ERRCODE='42501';
 END IF;
 IF p_date IS NULL THEN RAISE EXCEPTION 'Date is required'; END IF;
 SELECT * INTO b FROM public.branches WHERE id=p_branch AND restaurant_id=p_restaurant AND is_active IS NOT FALSE FOR UPDATE;
 IF NOT FOUND OR b.branch_key IS NULL THEN RAISE EXCEPTION 'Active branch unavailable'; END IF;
 SELECT * INTO s FROM public.daily_cash_settlements WHERE restaurant_id=p_restaurant AND branch=b.branch_key AND date=p_date FOR UPDATE;
 IF FOUND THEN
  IF s.branch_id IS NOT NULL AND s.branch_id<>b.id THEN RAISE EXCEPTION 'Branch scope mismatch'; END IF;
  RETURN s;
 END IF;
 IF EXISTS(SELECT 1 FROM public.daily_cash_settlements WHERE restaurant_id=p_restaurant AND branch=b.branch_key AND date>p_date) THEN
  RAISE EXCEPTION 'Later settlement exists; review opening balances before backdating';
 END IF;
 SELECT cash_counted INTO opening FROM public.daily_cash_settlements WHERE restaurant_id=p_restaurant AND branch=b.branch_key AND date<p_date AND status='Approved' ORDER BY date DESC LIMIT 1;
 INSERT INTO public.daily_cash_settlements(date,branch,branch_id,restaurant_id,created_by,opening_cash,expected_closing_cash,status)
 VALUES(p_date,b.branch_key,b.id,p_restaurant,auth.jwt()->>'email',coalesce(opening,0),coalesce(opening,0),'Draft') RETURNING * INTO s;
 RETURN s;
END $function$;

REVOKE ALL ON FUNCTION closing_funding_private.prepare_register(uuid,uuid,date) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION closing_funding_private.post(p_request_id uuid, p_restaurant_id uuid, p_branch_id uuid, p_date date, p_shift text, p_cashier_id uuid, p_amount numeric, p_source text, p_source_account_id uuid DEFAULT NULL::uuid, p_destination_account_id uuid DEFAULT NULL::uuid, p_note text DEFAULT ''::text, p_received boolean DEFAULT false, p_settled boolean DEFAULT false, p_correction_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 b public.branches; s public.daily_cash_settlements; v_payload jsonb; v_existing public.sales_closing_funding_requests;
 v_source public.treasury_accounts; v_balance numeric; v_debit uuid; v_result jsonb; v_injection public.owner_cash_injections; v_count integer; v_id uuid;
BEGIN
 IF NOT closing_funding_private.can_fund(p_restaurant_id,p_branch_id)
 THEN RAISE EXCEPTION 'CLOSING_FUNDING_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT public.treasury_account_is_owner(p_restaurant_id) AND
 (p_source NOT IN ('restaurant','treasury') OR p_cashier_id IS DISTINCT FROM auth.uid())
 THEN RAISE EXCEPTION 'CLOSING_FUNDING_PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_date IS NULL OR p_date>(now() AT TIME ZONE 'Asia/Riyadh')::date OR p_cashier_id IS NULL OR p_shift IS NULL OR p_shift NOT IN ('Morning','Evening')
 OR p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount<=0 OR p_amount>1000000000 OR round(p_amount,2)<>p_amount
 OR p_source IS NULL OR p_source NOT IN ('owner','treasury','restaurant') OR p_received IS NOT TRUE OR length(trim(coalesce(p_note,'')))<10
 THEN RAISE EXCEPTION 'CLOSING_FUNDING_INVALID_INPUT'; END IF;
 v_payload:=jsonb_build_object('restaurant',p_restaurant_id,'branch',p_branch_id,'date',p_date,'shift',p_shift,'cashier',p_cashier_id,
 'amount',p_amount,'source',p_source,'source_account',p_source_account_id,'destination_account',p_destination_account_id,'note',p_note,'received',p_received,'settled',p_settled);
 PERFORM pg_advisory_xact_lock(hashtextextended('closing-funding:'||p_request_id::text,0));
 SELECT * INTO v_existing FROM public.sales_closing_funding_requests WHERE id=p_request_id;
 IF FOUND THEN
   IF v_existing.payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION 'CLOSING_FUNDING_REQUEST_CONFLICT'; END IF;
   RETURN v_existing.result || jsonb_build_object('status','already_posted');
 END IF;
 -- Use the same scope lock as erp_save_sales_closing_core to serialize funding and finalization.
 PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|',p_restaurant_id::text,p_branch_id::text,p_date::text,lower(p_shift),p_cashier_id::text),0));
 SELECT * INTO b FROM public.branches WHERE id=p_branch_id AND restaurant_id=p_restaurant_id AND is_active IS NOT FALSE FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CLOSING_FUNDING_BRANCH_INVALID'; END IF;
 IF p_cashier_id<>auth.uid() AND NOT EXISTS(SELECT 1 FROM public.employees e WHERE e.id=p_cashier_id AND e.restaurant_id=p_restaurant_id
   AND (e.branch_id=p_branch_id OR (e.branch_id IS NULL AND e.branch=b.branch_key)) AND e.is_active IS NOT FALSE)
 THEN RAISE EXCEPTION 'CLOSING_FUNDING_CASHIER_INVALID'; END IF;

 IF p_correction_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM public.daily_sales WHERE id=p_correction_id AND restaurant_id=p_restaurant_id::text
 AND branch_id=p_branch_id AND date<=p_date
 AND cashier_id=p_cashier_id AND closing_state='finalized')
 THEN RAISE EXCEPTION 'CLOSING_FUNDING_CORRECTION_SCOPE_INVALID'; END IF;
 -- A later finalized count still blocks correction; immutable versions remain intact.

 IF EXISTS(SELECT 1 FROM public.daily_sales d WHERE d.restaurant_id=p_restaurant_id::text
   AND (d.branch_id=p_branch_id OR (d.branch_id IS NULL AND d.branch=b.branch_key)) AND d.closing_state='finalized' AND (p_correction_id IS NULL OR d.id<>p_correction_id)
   AND (d.date>p_date OR (d.date=p_date AND ((p_shift='Morning' AND d.shift='Evening')))))
 THEN RAISE EXCEPTION 'CLOSING_FUNDING_CLOSED_PERIOD'; END IF;
 IF EXISTS(SELECT 1 FROM public.owner_cash_injections WHERE id=p_request_id)
 OR EXISTS(SELECT 1 FROM public.wallet_transactions WHERE restaurant_id=p_restaurant_id AND (settlement_request_id=p_request_id OR reference_id=p_request_id::text))
 THEN RAISE EXCEPTION 'CLOSING_FUNDING_REQUEST_CONFLICT'; END IF;
 IF p_source='owner' THEN
   IF p_source_account_id IS NOT NULL OR p_destination_account_id IS NOT NULL THEN RAISE EXCEPTION 'CLOSING_FUNDING_INVALID_INPUT'; END IF;
   v_injection:=public.post_owner_cash_injection(p_request_id,p_restaurant_id,p_branch_id,p_date,p_amount,'Operational Funding',p_note,NULL);
   -- Scope only the movement created within this transaction, never prior rows.
   UPDATE public.cash_movements SET shift=p_shift,cashier_id=p_cashier_id,branch_id=p_branch_id,payment_method='cash'
    WHERE restaurant_id=p_restaurant_id AND source_module='OwnerCashInjection' AND source_record_id=p_request_id::text AND is_reversed IS NOT TRUE
    RETURNING id INTO v_id;
   IF v_id IS NULL THEN RAISE EXCEPTION 'CLOSING_FUNDING_MOVEMENT_MISSING'; END IF;

 ELSIF p_source='restaurant' OR (p_source='treasury' AND NOT public.treasury_account_is_owner(p_restaurant_id)) THEN
   IF p_date<>(now() AT TIME ZONE 'Asia/Riyadh')::date THEN RAISE EXCEPTION 'CLOSING_FUNDING_TREASURY_DATE_REVIEW'; END IF;
   IF p_source='restaurant' AND p_destination_account_id IS NOT NULL THEN RAISE EXCEPTION 'CLOSING_FUNDING_INVALID_INPUT'; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|','sales_closing_wallet',p_restaurant_id::text,p_branch_id::text),0));
   SELECT * INTO v_source FROM public.treasury_accounts WHERE id=p_source_account_id AND restaurant_id=p_restaurant_id AND is_active
    AND ((p_source='restaurant' AND (branch_id=p_branch_id OR (branch_id IS NULL AND branch_key=b.branch_key)) AND account_type IN ('cash','petty_cash'))
      OR (p_source='treasury' AND branch_id IS NULL AND branch_key IS NULL AND account_type IN ('cash','bank','digital_wallet','network_pos','clearing'))) FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'CLOSING_FUNDING_BRANCH_WALLET_INVALID'; END IF;
   IF p_source='treasury' AND NOT EXISTS (SELECT 1 FROM public.treasury_accounts a WHERE a.id=p_destination_account_id AND a.restaurant_id=p_restaurant_id AND a.is_active AND (a.branch_id=p_branch_id OR (a.branch_id IS NULL AND a.branch_key=b.branch_key)) AND a.account_type IN ('cash','petty_cash') AND a.currency=v_source.currency)
   THEN RAISE EXCEPTION 'CLOSING_FUNDING_BRANCH_WALLET_INVALID'; END IF;
   IF v_source.account_type IN ('network_pos','clearing') AND p_settled IS NOT TRUE THEN RAISE EXCEPTION 'OWNER_FUNDING_NETWORK_SETTLEMENT_NOT_CONFIRMED'; END IF;
   IF v_source.currency IS DISTINCT FROM (SELECT coalesce(nullif(currency,''),'SAR') FROM public.restaurants WHERE id=p_restaurant_id)
   THEN RAISE EXCEPTION 'CLOSING_FUNDING_CURRENCY_MISMATCH'; END IF;
   SELECT v_source.opening_balance+coalesce(sum(CASE WHEN direction='in' THEN amount WHEN direction='out' THEN -amount ELSE 0 END),0)
     INTO v_balance FROM public.wallet_transactions WHERE account_id=v_source.id AND restaurant_id=p_restaurant_id;
   IF v_balance<p_amount THEN RAISE EXCEPTION 'CLOSING_FUNDING_INSUFFICIENT_BALANCE'; END IF;
   s:=closing_funding_private.prepare_register(p_restaurant_id,p_branch_id,p_date);
   IF s.status NOT IN ('Draft','Rejected') THEN RAISE EXCEPTION 'CLOSING_FUNDING_CLOSED_PERIOD'; END IF;
   INSERT INTO public.wallet_transactions(transaction_date,transaction_type,flow_type,direction,wallet,branch,branch_id,amount,payment_method,description,
     reference_id,auto_generated,restaurant_id,account_id,settlement_request_id,recorded_by,created_by)
   VALUES(p_date,'closing_wallet_funding','closing_settlement','out',CASE WHEN p_source='restaurant' THEN 'branch_cash' ELSE coalesce(v_source.legacy_wallet_key,'owner_cash') END,b.branch_key,p_branch_id,p_amount,'cash',p_note,
     p_request_id::text,true,p_restaurant_id,v_source.id,p_request_id,auth.uid()::text,auth.uid()::text) RETURNING id INTO v_debit;
   INSERT INTO public.cash_movements(date,branch,branch_id,restaurant_id,direction,amount,movement_type,source_module,source_record_id,
     source_document_id,description,posted_by,created_by,settlement_id,shift,cashier_id,payment_method,settlement_request_id)
   VALUES(p_date,b.branch_key,p_branch_id,p_restaurant_id,'in',p_amount,'cash_deposit','Treasury',v_debit::text,
     p_request_id::text,p_note,auth.uid()::text,auth.uid()::text,s.id,p_shift,p_cashier_id,'cash',p_request_id) RETURNING id INTO v_id;
   UPDATE public.daily_cash_settlements SET cash_transfer_in=coalesce(cash_transfer_in,0)+p_amount WHERE id=s.id;
   PERFORM public.recompute_settlement(s.id);
   v_result:=jsonb_build_object('debit_id',v_debit,'source_account_id',v_source.id);
 ELSE
   -- Existing treasury transfer API posts on the Riyadh business date.
   IF p_date<>(now() AT TIME ZONE 'Asia/Riyadh')::date THEN RAISE EXCEPTION 'CLOSING_FUNDING_TREASURY_DATE_REVIEW'; END IF;
   s:=closing_funding_private.prepare_register(p_restaurant_id,p_branch_id,p_date);
   IF s.status NOT IN ('Draft','Rejected') THEN RAISE EXCEPTION 'CLOSING_FUNDING_CLOSED_PERIOD'; END IF;
   v_result:=public.erp_owner_fund_branch(p_restaurant_id,p_branch_id,p_source_account_id,p_destination_account_id,p_amount,'cash',p_request_id,p_note,p_settled,p_received);
   IF v_result->>'status' IS DISTINCT FROM 'posted' OR v_result->>'credit_id' IS NULL THEN RAISE EXCEPTION 'CLOSING_FUNDING_REQUEST_CONFLICT'; END IF;
   -- The canonical transfer writes both treasury legs; its trigger intentionally
   -- does not post owner_to_branch_funding to the drawer. Post that leg once.
   IF EXISTS(SELECT 1 FROM public.cash_movements WHERE restaurant_id=p_restaurant_id AND source_module='Treasury' AND source_record_id=v_result->>'credit_id' AND is_reversed IS NOT TRUE) THEN RAISE EXCEPTION 'CLOSING_FUNDING_MOVEMENT_ALREADY_EXISTS'; END IF;
   INSERT INTO public.cash_movements(date,branch,branch_id,restaurant_id,direction,amount,movement_type,source_module,source_record_id,
      source_document_id,description,posted_by,created_by,settlement_id,shift,cashier_id,payment_method,settlement_request_id)
   VALUES(p_date,b.branch_key,p_branch_id,p_restaurant_id,'in',p_amount,'cash_deposit','Treasury',v_result->>'credit_id',
      p_request_id::text,p_note,auth.uid()::text,auth.uid()::text,s.id,p_shift,p_cashier_id,'cash',p_request_id) RETURNING id INTO v_id;
   UPDATE public.daily_cash_settlements SET cash_transfer_in=coalesce(cash_transfer_in,0)+p_amount WHERE id=s.id;
   PERFORM public.recompute_settlement(s.id);
 END IF;
 SELECT count(*) INTO v_count FROM public.cash_movements WHERE id=v_id AND amount=p_amount AND direction='in' AND cashier_id=p_cashier_id AND shift=p_shift;
 IF v_count<>1 THEN RAISE EXCEPTION 'CLOSING_FUNDING_MOVEMENT_MISSING'; END IF;
 v_result:=coalesce(v_result,'{}'::jsonb)||jsonb_build_object('status','posted','request_id',p_request_id,'movement_id',v_id,'amount',p_amount);
 INSERT INTO public.sales_closing_funding_requests VALUES(p_request_id,p_restaurant_id,p_branch_id,v_payload,v_result,auth.uid(),now());
 RETURN v_result;
END $function$;
CREATE OR REPLACE FUNCTION public.erp_finalize_sales_closing_with_funding(p_payload jsonb, p_closing_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 r uuid:=(p_payload->>'restaurant_id')::uuid; b uuid:=(p_payload->>'branch_id')::uuid;
 d date:=(p_payload->>'date')::date; sh text:=p_payload->>'shift'; c uuid:=(p_payload->>'cashier_id')::uuid;
 f jsonb:=p_payload->'wallet_funding'; req closing_funding_private.requests; existing public.daily_sales;
 result jsonb; fund_result jsonb; correction uuid; request_payload jsonb;
BEGIN
 IF NOT closing_funding_private.can_fund(r,b)
 THEN RAISE EXCEPTION 'CLOSING_FUNDING_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT public.treasury_account_is_owner(r) AND c IS DISTINCT FROM auth.uid()
 THEN RAISE EXCEPTION 'CLOSING_FUNDING_PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR f IS NULL OR f->>'source' NOT IN ('treasury','restaurant') OR (f->>'received')::boolean IS DISTINCT FROM true
 OR p_payload->>'closing_state' IS DISTINCT FROM 'finalized' THEN RAISE EXCEPTION 'CLOSING_FUNDING_INVALID_INPUT'; END IF;
 request_payload:=jsonb_build_object('closing_id',p_closing_id,'payload',p_payload);
 PERFORM pg_advisory_xact_lock(hashtextextended('atomic-closing:'||p_request_id::text,0));
 SELECT * INTO req FROM closing_funding_private.requests WHERE id=p_request_id;
 IF FOUND THEN
 IF req.actor<>auth.uid() OR req.payload IS DISTINCT FROM request_payload THEN RAISE EXCEPTION 'CLOSING_FUNDING_REQUEST_CONFLICT'; END IF;
 RETURN req.result||jsonb_build_object('idempotent',true,'finalized_transition',false);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|','closing-day',r::text,b::text,d::text),0));
 PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|',r::text,b::text,d::text,lower(sh),c::text),0));
 -- Lock the same branch before the closing row, matching the funding lock order.
 PERFORM 1 FROM public.branches WHERE id=b AND restaurant_id=r FOR UPDATE;
 SELECT * INTO existing FROM public.daily_sales WHERE restaurant_id=r::text AND branch_id=b
 AND date=d AND lower(trim(shift))=lower(trim(sh)) AND cashier_id=c
 AND (id=p_closing_id OR (p_closing_id IS NULL AND closing_session_id=NULLIF(p_payload->>'closing_session_id','')::uuid)) FOR UPDATE;
 IF p_closing_id IS NOT NULL AND existing.id IS DISTINCT FROM p_closing_id THEN RAISE EXCEPTION 'SALES_CLOSING_BRANCH_CONTEXT_MISMATCH'; END IF;
 IF existing.closing_state='finalized' THEN
   IF p_closing_id IS NULL THEN RAISE EXCEPTION 'CLOSING_OPEN_EXISTING'; END IF;
   correction:=existing.id;
 END IF;
 IF p_closing_id IS NULL AND p_payload->>'closing_session_id' IS NOT NULL AND existing.id IS NULL THEN
   correction:=public.erp_closing_predecessor(r,b,p_payload->>'branch',d,sh,c,NULL);
 END IF;
 fund_result:=closing_funding_private.post(p_request_id,r,b,d,sh,c,(f->>'amount')::numeric,f->>'source',
 (f->>'source_account_id')::uuid,(f->>'destination_account_id')::uuid,
 'Wallet funding and closing confirmed together',true,true,correction);
 result:=public.erp_finalize_sales_closing(p_payload-'wallet_funding',p_closing_id,p_request_id);
 -- A changed ledger/count cannot spend money and leave an unresolved closing.
 IF (result->'closing'->>'cash_difference')::numeric IS DISTINCT FROM 0 THEN
 RAISE EXCEPTION 'CLOSING_FUNDING_PREVIEW_CHANGED'; END IF;
 result:=result||jsonb_build_object('funding',fund_result);
 INSERT INTO closing_funding_private.requests(id,actor,payload,result) VALUES(p_request_id,auth.uid(),request_payload,result);
 RETURN result;
END;$function$;
