-- Cash register commands run as the caller; existing owner-only write RLS is retained.
CREATE OR REPLACE FUNCTION public.cash_register_prepare(p_restaurant uuid,p_branch uuid,p_date date)
RETURNS public.daily_cash_settlements LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE b public.branches; s public.daily_cash_settlements; opening numeric:=0;
BEGIN
 IF auth.uid() IS NULL OR NOT public.erp_can_write_scope_text(p_restaurant::text,p_branch::text) THEN
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
END $$;
REVOKE ALL ON FUNCTION public.cash_register_prepare(uuid,uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cash_register_prepare(uuid,uuid,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_owner_cash_injection(p_request_id uuid,p_restaurant uuid,p_branch uuid,p_date date,p_amount numeric,p_reason text,p_notes text DEFAULT '',p_shortage uuid DEFAULT NULL)
RETURNS public.owner_cash_injections LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE b public.branches; s public.daily_cash_settlements; i public.owner_cash_injections;
 w uuid:=gen_random_uuid(); shortage public.cash_shortages; v_name text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.erp_can_write_scope_text(p_restaurant::text,p_branch::text) THEN
  RAISE EXCEPTION 'Cash injection requires business owner permission' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR p_date IS NULL OR p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount<=0 OR round(p_amount,2)<>p_amount OR nullif(trim(p_reason),'') IS NULL THEN
  RAISE EXCEPTION 'Valid request, date, positive two-decimal amount and reason required';
 END IF;
 SELECT * INTO b FROM public.branches WHERE id=p_branch AND restaurant_id=p_restaurant AND is_active IS NOT FALSE FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active branch unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM public.owner_cash_injections WHERE id=p_request_id;
 IF FOUND THEN
  IF i.restaurant_id IS DISTINCT FROM p_restaurant OR i.branch_id IS DISTINCT FROM p_branch OR i.date IS DISTINCT FROM p_date OR i.amount IS DISTINCT FROM p_amount OR i.reason IS DISTINCT FROM p_reason OR i.notes IS DISTINCT FROM coalesce(p_notes,'') OR i.shortage_id IS DISTINCT FROM p_shortage THEN
   RAISE EXCEPTION 'Request already used for a different injection';
  END IF;
  RETURN i;
 END IF;
 s:=public.cash_register_prepare(p_restaurant,p_branch,p_date);
 IF s.status NOT IN ('Draft','Rejected') THEN RAISE EXCEPTION 'Settlement is submitted or approved; choose an open date'; END IF;
 IF EXISTS(SELECT 1 FROM public.daily_cash_settlements WHERE restaurant_id=p_restaurant AND branch=b.branch_key AND date>p_date) THEN RAISE EXCEPTION 'Later settlement exists; backdated injection requires review'; END IF;
 IF p_shortage IS NOT NULL THEN
  SELECT * INTO shortage FROM public.cash_shortages WHERE id=p_shortage AND restaurant_id=p_restaurant AND (branch_id=p_branch OR (branch_id IS NULL AND branch=b.branch_key)) FOR UPDATE;
  IF NOT FOUND OR shortage.type<>'Shortage' OR shortage.status IN ('Resolved','Paid') OR shortage.closing_id IS NOT NULL OR shortage.injection_id IS NOT NULL OR p_amount<>shortage.shortage_amount THEN
   RAISE EXCEPTION 'Only an unresolved register shortage can be covered in full here; use Sales Closing for its own shortages';
  END IF;
 END IF;
 v_name:=auth.jwt()->>'email';
 -- This capital contribution is new external owner cash, not an owner-wallet transfer.
 -- Wallet trigger ignores this type; the injection trigger is the sole drawer poster.
 INSERT INTO public.wallet_transactions(id,transaction_date,transaction_type,wallet,direction,branch,branch_id,restaurant_id,amount,payment_method,description,reference_id,auto_generated,recorded_by,created_by)
 VALUES(w,p_date,'owner_capital_contribution','branch_cash','in',b.branch_key,b.id,p_restaurant,p_amount,'cash','Owner Cash Injection: '||p_reason,p_request_id::text,true,v_name,v_name);
 INSERT INTO public.owner_cash_injections(id,date,branch,branch_id,restaurant_id,amount,reason,notes,created_by,created_by_name,approval_status,approved_by,approved_at,wallet_transaction_id,settlement_id,shortage_id)
 VALUES(p_request_id,p_date,b.branch_key,b.id,p_restaurant,p_amount,p_reason,coalesce(p_notes,''),v_name,v_name,'Approved',v_name,now(),w,s.id,p_shortage) RETURNING * INTO i;
 UPDATE public.cash_movements SET branch_id=b.id WHERE source_module='OwnerCashInjection' AND source_record_id=i.id::text AND restaurant_id=p_restaurant AND branch_id IS NULL;
 IF p_shortage IS NOT NULL THEN
  UPDATE public.cash_shortages SET status='Resolved',resolution='Owner Injection',injection_id=i.id,owner_notes=coalesce(p_notes,''),reviewed_by=v_name,reviewed_at=now() WHERE id=p_shortage;
 END IF;
 RETURN i;
END $$;
REVOKE ALL ON FUNCTION public.post_owner_cash_injection(uuid,uuid,uuid,date,numeric,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_owner_cash_injection(uuid,uuid,uuid,date,numeric,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cash_register_transition(p_id uuid,p_action text,p_counted numeric DEFAULT NULL,p_notes text DEFAULT '')
RETURNS public.daily_cash_settlements LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.daily_cash_settlements; v_expected numeric; v_difference numeric; v_shortage uuid; v_ledger numeric;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.daily_cash_settlements WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT public.erp_can_write_scope_text(s.restaurant_id::text,s.branch_id::text) THEN RAISE EXCEPTION 'Cash register owner permission required' USING ERRCODE='42501'; END IF;
 IF p_action='submit' THEN
  IF p_counted IS NULL OR p_counted::text IN ('NaN','Infinity','-Infinity') OR p_counted<0 OR round(p_counted,2)<>p_counted THEN RAISE EXCEPTION 'Valid counted cash required'; END IF;
  IF s.status='Submitted' AND s.cash_counted=p_counted AND coalesce(s.notes,'')=coalesce(p_notes,'') THEN RETURN s; END IF;
  IF s.status NOT IN ('Draft','Rejected') THEN RAISE EXCEPTION 'Only draft or rejected settlements can be submitted'; END IF;
  v_expected:=coalesce(s.opening_cash,0)+coalesce(s.cash_sales,0)+coalesce(s.customer_debt_collection,0)+coalesce(s.owner_injection,0)+coalesce(s.cash_transfer_in,0)+coalesce(s.supplier_refunds,0)-coalesce(s.cash_purchases,0)-coalesce(s.cash_expenses,0)-coalesce(s.supplier_payments,0)-coalesce(s.cash_refunds_out,0)-coalesce(s.cash_transfer_out,0);
  SELECT coalesce(sum(CASE WHEN direction='in' THEN amount WHEN direction='out' THEN -amount ELSE 0 END),0) INTO v_ledger FROM public.cash_movements WHERE settlement_id=s.id AND NOT coalesce(is_reversed,false);
  IF abs(v_expected-coalesce(s.opening_cash,0)-v_ledger)>0.005 OR EXISTS(SELECT 1 FROM public.cash_movements WHERE settlement_id=s.id AND source_module='OwnerCashInjection' AND NOT coalesce(is_reversed,false) GROUP BY source_record_id HAVING count(*)>1) OR EXISTS(SELECT 1 FROM public.owner_cash_injections WHERE restaurant_id=s.restaurant_id AND branch=s.branch AND date=s.date AND wallet_transaction_id IS NULL) THEN
   RAISE EXCEPTION 'Register ledger needs reconciliation before closing';
  END IF;
  v_difference:=p_counted-v_expected;
  IF s.shortage_record_id IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM public.cash_shortages WHERE id=s.shortage_record_id AND (injection_id IS NOT NULL OR status IN ('Resolved','Paid'))) THEN RAISE EXCEPTION 'Resolved discrepancy cannot be overwritten'; END IF;
   UPDATE public.cash_shortages SET expected_amount=v_expected,actual_amount=p_counted,shortage_amount=greatest(-v_difference,0),overage_amount=greatest(v_difference,0),type=CASE WHEN v_difference<0 THEN 'Shortage' ELSE 'Overage' END,status=CASE WHEN v_difference=0 THEN 'Resolved' ELSE 'Pending' END,manager_notes=p_notes WHERE id=s.shortage_record_id;
   v_shortage:=s.shortage_record_id;
  ELSIF v_difference<>0 THEN
   INSERT INTO public.cash_shortages(date,branch,branch_id,restaurant_id,created_by,settlement_id,expected_amount,actual_amount,shortage_amount,overage_amount,type,status,reported_by,manager_notes)
   VALUES(s.date,s.branch,s.branch_id,s.restaurant_id,auth.jwt()->>'email',s.id,v_expected,p_counted,greatest(-v_difference,0),greatest(v_difference,0),CASE WHEN v_difference<0 THEN 'Shortage' ELSE 'Overage' END,'Pending',auth.jwt()->>'email',p_notes) RETURNING id INTO v_shortage;
  END IF;
  UPDATE public.daily_cash_settlements SET cash_counted=p_counted,expected_closing_cash=v_expected,difference=v_difference,shortage=greatest(-v_difference,0),overage=greatest(v_difference,0),notes=p_notes,status='Submitted',submitted_at=now(),manager=auth.jwt()->>'email',shortage_record_id=v_shortage WHERE id=s.id RETURNING * INTO s;
 ELSIF p_action IN ('approve','reject') THEN
  IF s.status=(CASE WHEN p_action='approve' THEN 'Approved' ELSE 'Rejected' END) THEN RETURN s; END IF;
  IF s.status<>'Submitted' THEN RAISE EXCEPTION 'Only submitted settlements can be reviewed'; END IF;
  UPDATE public.daily_cash_settlements SET status=CASE WHEN p_action='approve' THEN 'Approved' ELSE 'Rejected' END,approved_by=auth.jwt()->>'email',approved_at=now(),notes=CASE WHEN p_action='reject' THEN p_notes ELSE notes END WHERE id=s.id RETURNING * INTO s;
 ELSE RAISE EXCEPTION 'Unknown cash register action'; END IF;
 RETURN s;
END $$;
REVOKE ALL ON FUNCTION public.cash_register_transition(uuid,text,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cash_register_transition(uuid,text,numeric,text) TO authenticated;

-- Carry forward counted cash after approval, preserving the historical discrepancy.
-- Never silently rewrite a later submitted/approved count.
CREATE OR REPLACE FUNCTION public.trg_update_next_day_opening_cash()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_next public.daily_cash_settlements;
BEGIN
 IF NEW.status='Approved' THEN
  SELECT * INTO v_next FROM public.daily_cash_settlements WHERE restaurant_id=NEW.restaurant_id AND branch=NEW.branch AND date=NEW.date+1 FOR UPDATE;
  IF FOUND AND v_next.status NOT IN ('Draft','Rejected') THEN RAISE EXCEPTION 'Next day is already submitted or approved; reconcile before approving this day'; END IF;
  INSERT INTO public.daily_cash_settlements(date,branch,branch_id,restaurant_id,created_by,opening_cash,expected_closing_cash,status)
  VALUES(NEW.date+1,NEW.branch,NEW.branch_id,NEW.restaurant_id,NEW.created_by,NEW.cash_counted,NEW.cash_counted,'Draft')
  ON CONFLICT (date,branch,(coalesce(restaurant_id,'00000000-0000-0000-0000-000000000000'::uuid))) DO UPDATE SET opening_cash=EXCLUDED.opening_cash,updated_date=now()
  RETURNING * INTO v_next;
  PERFORM public.recompute_settlement(v_next.id);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.trg_update_next_day_opening_cash() FROM PUBLIC,anon,authenticated;

-- Internal definer helpers are used by triggers, not a public mutation API.
REVOKE ALL ON FUNCTION public.get_or_create_settlement(date,text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.recompute_settlement(uuid) FROM PUBLIC,anon,authenticated;
