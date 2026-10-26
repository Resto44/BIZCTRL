-- Funding may amend today's latest finalized closing only inside atomic finalization.
-- The public standalone funding endpoint retains its closed-period protection.
CREATE SCHEMA IF NOT EXISTS closing_funding_private;
REVOKE ALL ON SCHEMA closing_funding_private FROM PUBLIC,anon,authenticated;
CREATE TABLE closing_funding_private.requests (
 id uuid PRIMARY KEY, actor uuid NOT NULL, payload jsonb NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE closing_funding_private.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON closing_funding_private.requests FROM PUBLIC,anon,authenticated;
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.erp_fund_sales_closing_drawer(uuid,uuid,uuid,date,text,uuid,numeric,text,uuid,uuid,text,boolean,boolean)'::regprocedure) INTO definition;
 IF position('AND d.closing_state=''finalized''' IN definition)=0 THEN RAISE EXCEPTION 'FUNDING_DEFINITION_CHANGED'; END IF;
 definition:=replace(definition,'public.erp_fund_sales_closing_drawer(', 'closing_funding_private.post(');
 definition:=replace(definition,'p_settled boolean DEFAULT false)', 'p_settled boolean DEFAULT false, p_correction_id uuid DEFAULT NULL)');
 definition:=replace(definition,'-- Do not rewrite certified counts or the opening chain of a later closing.', $guard$
 IF p_correction_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM public.daily_sales WHERE id=p_correction_id AND restaurant_id=p_restaurant_id::text
 AND branch_id=p_branch_id AND date=p_date AND date=(now() AT TIME ZONE 'Asia/Riyadh')::date
 AND shift=p_shift AND cashier_id=p_cashier_id AND closing_state='finalized')
 THEN RAISE EXCEPTION 'CLOSING_FUNDING_CORRECTION_SCOPE_INVALID'; END IF;
 -- A later finalized count still blocks correction; immutable versions remain intact.
 $guard$);
 definition:=replace(definition,'AND d.closing_state=''finalized''','AND d.closing_state=''finalized'' AND (p_correction_id IS NULL OR d.id<>p_correction_id)');
 EXECUTE definition;
END;$migration$;
REVOKE ALL ON FUNCTION closing_funding_private.post(uuid,uuid,uuid,date,text,uuid,numeric,text,uuid,uuid,text,boolean,boolean,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.erp_finalize_sales_closing_with_funding(p_payload jsonb,p_closing_id uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 r uuid:=(p_payload->>'restaurant_id')::uuid; b uuid:=(p_payload->>'branch_id')::uuid;
 d date:=(p_payload->>'date')::date; sh text:=p_payload->>'shift'; c uuid:=(p_payload->>'cashier_id')::uuid;
 f jsonb:=p_payload->'wallet_funding'; req closing_funding_private.requests; existing public.daily_sales;
 result jsonb; fund_result jsonb; correction uuid; request_payload jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.treasury_account_is_owner(r) OR NOT public.erp_can_write_scope_text(r::text,b::text)
 THEN RAISE EXCEPTION 'CLOSING_FUNDING_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR f IS NULL OR f->>'source' NOT IN ('treasury','restaurant') OR (f->>'received')::boolean IS DISTINCT FROM true
 OR p_payload->>'closing_state' IS DISTINCT FROM 'finalized' THEN RAISE EXCEPTION 'CLOSING_FUNDING_INVALID_INPUT'; END IF;
 request_payload:=jsonb_build_object('closing_id',p_closing_id,'payload',p_payload);
 PERFORM pg_advisory_xact_lock(hashtextextended('atomic-closing:'||p_request_id::text,0));
 SELECT * INTO req FROM closing_funding_private.requests WHERE id=p_request_id;
 IF FOUND THEN
 IF req.actor<>auth.uid() OR req.payload IS DISTINCT FROM request_payload THEN RAISE EXCEPTION 'CLOSING_FUNDING_REQUEST_CONFLICT'; END IF;
 RETURN req.result||jsonb_build_object('idempotent',true,'finalized_transition',false);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws('|',r::text,b::text,d::text,lower(sh),c::text),0));
 -- Lock the same branch before the closing row, matching the funding lock order.
 PERFORM 1 FROM public.branches WHERE id=b AND restaurant_id=r FOR UPDATE;
 SELECT * INTO existing FROM public.daily_sales WHERE restaurant_id=r::text AND branch_id=b
 AND date=d AND lower(trim(shift))=lower(trim(sh)) AND cashier_id=c FOR UPDATE;
 IF p_closing_id IS NOT NULL AND existing.id IS DISTINCT FROM p_closing_id THEN RAISE EXCEPTION 'SALES_CLOSING_BRANCH_CONTEXT_MISMATCH'; END IF;
 IF existing.closing_state='finalized' THEN
   IF p_closing_id IS NULL THEN RAISE EXCEPTION 'CLOSING_OPEN_EXISTING'; END IF;
   correction:=existing.id;
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
END;$$;
REVOKE ALL ON FUNCTION public.erp_finalize_sales_closing_with_funding(jsonb,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_finalize_sales_closing_with_funding(jsonb,uuid,uuid) TO authenticated;
