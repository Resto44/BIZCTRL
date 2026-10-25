-- Account balances for the two-choice closing funding UI. No money moves on read.
CREATE OR REPLACE FUNCTION public.erp_closing_funding_accounts(p_restaurant uuid,p_branch uuid,p_currency text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; b public.branches;
BEGIN
 IF auth.uid() IS NULL OR NOT public.treasury_account_is_owner(p_restaurant)
 OR NOT public.erp_can_write_scope_text(p_restaurant::text,p_branch::text) THEN
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
END;$$;
REVOKE ALL ON FUNCTION public.erp_closing_funding_accounts(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_closing_funding_accounts(uuid,uuid,text) TO authenticated;

-- Extend the existing atomic/idempotent posting boundary with a branch-wallet
-- debit and matching drawer receipt. Keep owner transfers and closing guards.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.erp_fund_sales_closing_drawer(uuid,uuid,uuid,date,text,uuid,numeric,text,uuid,uuid,text,boolean,boolean)'::regprocedure) INTO definition;
 IF position('p_source NOT IN (''owner'',''treasury'')' IN definition)=0
 OR position(' ELSE'||chr(10)||'   -- Existing treasury transfer API' IN definition)=0 THEN RAISE EXCEPTION 'CLOSING_FUNDING_CONTEXT_CHANGED'; END IF;
 definition:=replace(definition,'v_result jsonb;','v_source public.treasury_accounts; v_balance numeric; v_debit uuid; v_result jsonb;');
 definition:=replace(definition,'p_source NOT IN (''owner'',''treasury'')','p_source NOT IN (''owner'',''treasury'',''restaurant'')');
 definition:=replace(definition,' ELSE'||chr(10)||'   -- Existing treasury transfer API',$branch$
 ELSIF p_source='restaurant' THEN
   IF p_date<>(now() AT TIME ZONE 'Asia/Riyadh')::date THEN RAISE EXCEPTION 'CLOSING_FUNDING_TREASURY_DATE_REVIEW'; END IF;
   IF p_destination_account_id IS NOT NULL THEN RAISE EXCEPTION 'CLOSING_FUNDING_INVALID_INPUT'; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|','sales_closing_wallet',p_restaurant_id::text,p_branch_id::text),0));
   SELECT * INTO v_source FROM public.treasury_accounts WHERE id=p_source_account_id AND restaurant_id=p_restaurant_id AND is_active
    AND (branch_id=p_branch_id OR (branch_id IS NULL AND branch_key=b.branch_key))
    AND account_type IN ('cash','petty_cash') FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'CLOSING_FUNDING_BRANCH_WALLET_INVALID'; END IF;
   IF v_source.currency IS DISTINCT FROM (SELECT coalesce(nullif(currency,''),'SAR') FROM public.restaurants WHERE id=p_restaurant_id)
   THEN RAISE EXCEPTION 'CLOSING_FUNDING_CURRENCY_MISMATCH'; END IF;
   SELECT v_source.opening_balance+coalesce(sum(CASE WHEN direction='in' THEN amount WHEN direction='out' THEN -amount ELSE 0 END),0)
     INTO v_balance FROM public.wallet_transactions WHERE account_id=v_source.id AND restaurant_id=p_restaurant_id;
   IF v_balance<p_amount THEN RAISE EXCEPTION 'CLOSING_FUNDING_INSUFFICIENT_BALANCE'; END IF;
   s:=public.cash_register_prepare(p_restaurant_id,p_branch_id,p_date);
   IF s.status NOT IN ('Draft','Rejected') THEN RAISE EXCEPTION 'CLOSING_FUNDING_CLOSED_PERIOD'; END IF;
   INSERT INTO public.wallet_transactions(transaction_date,transaction_type,flow_type,direction,wallet,branch,branch_id,amount,payment_method,description,
     reference_id,auto_generated,restaurant_id,account_id,settlement_request_id,recorded_by,created_by)
   VALUES(p_date,'closing_wallet_funding','closing_settlement','out','branch_cash',b.branch_key,p_branch_id,p_amount,'cash',p_note,
     p_request_id::text,true,p_restaurant_id,v_source.id,p_request_id,auth.uid()::text,auth.uid()::text) RETURNING id INTO v_debit;
   INSERT INTO public.cash_movements(date,branch,branch_id,restaurant_id,direction,amount,movement_type,source_module,source_record_id,
     source_document_id,description,posted_by,created_by,settlement_id,shift,cashier_id,payment_method,settlement_request_id)
   VALUES(p_date,b.branch_key,p_branch_id,p_restaurant_id,'in',p_amount,'cash_deposit','Treasury',v_debit::text,
     p_request_id::text,p_note,auth.uid()::text,auth.uid()::text,s.id,p_shift,p_cashier_id,'cash',p_request_id) RETURNING id INTO v_id;
   UPDATE public.daily_cash_settlements SET cash_transfer_in=coalesce(cash_transfer_in,0)+p_amount WHERE id=s.id;
   PERFORM public.recompute_settlement(s.id);
   v_result:=jsonb_build_object('debit_id',v_debit,'source_account_id',v_source.id);
 ELSE
   -- Existing treasury transfer API$branch$);
 EXECUTE definition;
END;$migration$;
DO $guard$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.erp_guard_posted_treasury_history()'::regprocedure) INTO definition;
 IF position('''branch_owner_cash_handover_debit'',''branch_to_owner_cash'') AND' IN definition)=0 THEN RAISE EXCEPTION 'TREASURY_GUARD_CONTEXT_CHANGED'; END IF;
 definition:=replace(definition,'''branch_owner_cash_handover_debit'',''branch_to_owner_cash'') AND','''branch_owner_cash_handover_debit'',''branch_to_owner_cash'',''closing_wallet_funding'') AND');
 EXECUTE definition;
END;$guard$;
