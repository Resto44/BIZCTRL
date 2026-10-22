-- An explicit funding receipt joins existing audited owner/treasury posting to
-- one cashier/shift. Nothing is posted just because a preview has a deficit.
CREATE TABLE public.sales_closing_funding_requests (
 id uuid PRIMARY KEY,
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 payload jsonb NOT NULL,
 result jsonb NOT NULL,
 recorded_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_closing_funding_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_closing_funding_requests FROM anon, authenticated;
GRANT SELECT ON public.sales_closing_funding_requests TO authenticated;
CREATE POLICY closing_funding_read ON public.sales_closing_funding_requests FOR SELECT TO authenticated
 USING (public.erp_can_access_scope_text(restaurant_id::text,branch_id::text));

CREATE FUNCTION public.erp_fund_sales_closing_drawer(
 p_request_id uuid,p_restaurant_id uuid,p_branch_id uuid,p_date date,
 p_shift text,p_cashier_id uuid,p_amount numeric,p_source text,
 p_source_account_id uuid DEFAULT NULL,p_destination_account_id uuid DEFAULT NULL,
 p_note text DEFAULT '',p_received boolean DEFAULT false,p_settled boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 b public.branches; s public.daily_cash_settlements; v_payload jsonb; v_existing public.sales_closing_funding_requests;
 v_result jsonb; v_injection public.owner_cash_injections; v_count integer; v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.treasury_account_is_owner(p_restaurant_id)
 OR NOT public.erp_can_write_scope_text(p_restaurant_id::text,p_branch_id::text)
 THEN RAISE EXCEPTION 'CLOSING_FUNDING_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_date IS NULL OR p_date>(now() AT TIME ZONE 'Asia/Riyadh')::date OR p_cashier_id IS NULL OR p_shift IS NULL OR p_shift NOT IN ('Morning','Evening')
 OR p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount<=0 OR p_amount>1000000000 OR round(p_amount,2)<>p_amount
 OR p_source IS NULL OR p_source NOT IN ('owner','treasury') OR p_received IS NOT TRUE OR length(trim(coalesce(p_note,'')))<10
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
 -- Do not rewrite certified counts or the opening chain of a later closing.
 IF EXISTS(SELECT 1 FROM public.daily_sales d WHERE d.restaurant_id=p_restaurant_id::text
   AND (d.branch_id=p_branch_id OR (d.branch_id IS NULL AND d.branch=b.branch_key)) AND d.closing_state='finalized'
   AND (d.date>p_date OR (d.date=p_date AND (d.shift=p_shift OR (p_shift='Morning' AND d.shift='Evening')))))
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
 ELSE
   -- Existing treasury transfer API posts on the Riyadh business date.
   IF p_date<>(now() AT TIME ZONE 'Asia/Riyadh')::date THEN RAISE EXCEPTION 'CLOSING_FUNDING_TREASURY_DATE_REVIEW'; END IF;
   s:=public.cash_register_prepare(p_restaurant_id,p_branch_id,p_date);
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
END $$;
REVOKE ALL ON FUNCTION public.erp_fund_sales_closing_drawer(uuid,uuid,uuid,date,text,uuid,numeric,text,uuid,uuid,text,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_fund_sales_closing_drawer(uuid,uuid,uuid,date,text,uuid,numeric,text,uuid,uuid,text,boolean,boolean) TO authenticated;

-- NULL document IDs are normal for standalone owner funding. SQL's NOT(NULL)
-- previously removed those receipts from the server expectation only.
DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.erp_sales_closing_expected_cash(uuid,uuid,text,date,text,uuid,uuid,numeric)'::regprocedure) INTO definition;
 IF position('AND movement.source_document_id = p_current_closing_id::text' IN definition)=0 THEN
   RAISE EXCEPTION 'Unexpected expected cash function; review before patching';
 END IF;
 definition:=replace(definition,
   'AND movement.source_document_id = p_current_closing_id::text',
   'AND p_current_closing_id IS NOT NULL AND movement.source_document_id IS NOT NULL AND movement.source_document_id = p_current_closing_id::text');
 EXECUTE definition;
END $$;

CREATE FUNCTION public.erp_validate_closing_network_accounts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE entries jsonb; entry jsonb; account public.network_accounts; amount numeric;
BEGIN
 IF TG_OP='UPDATE' THEN
   IF NEW.pos_entries_json IS NOT DISTINCT FROM OLD.pos_entries_json
     AND NEW.restaurant_id IS NOT DISTINCT FROM OLD.restaurant_id AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
     AND NEW.branch IS NOT DISTINCT FROM OLD.branch AND NEW.closing_state IS NOT DISTINCT FROM OLD.closing_state THEN RETURN NEW; END IF;
 END IF;
 entries:=coalesce(NEW.pos_entries_json,'[]'::jsonb);
 IF jsonb_typeof(entries)='string' THEN entries:=(entries#>>'{}')::jsonb; END IF;
 IF jsonb_typeof(entries)<>'array' THEN RAISE EXCEPTION 'CLOSING_NETWORK_ENTRIES_INVALID'; END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(entries) LOOP
   amount:=coalesce(nullif(entry->>'amount',''),'0')::numeric;
   IF amount::text IN ('NaN','Infinity','-Infinity') OR amount<0 OR round(amount,2)<>amount THEN RAISE EXCEPTION 'CLOSING_NETWORK_AMOUNT_INVALID'; END IF;
   IF amount=0 THEN CONTINUE; END IF;
   SELECT * INTO account FROM public.network_accounts a
   WHERE a.id::text=coalesce(nullif(entry->>'network_account_id',''),nullif(entry->>'device_id',''))
     AND a.restaurant_id=NEW.restaurant_id
     AND (CASE WHEN nullif(a.status,'') IS NOT NULL THEN lower(a.status)='active' ELSE a.is_active IS TRUE END)
     AND (a.branch_id=NEW.branch_id OR (a.branch_id IS NULL AND (a.branch=NEW.branch OR a.branch_key=NEW.branch)));
   IF NOT FOUND THEN RAISE EXCEPTION 'CLOSING_NETWORK_ACCOUNT_INVALID'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.erp_validate_closing_network_accounts() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_closing_network_accounts BEFORE INSERT OR UPDATE ON public.daily_sales
 FOR EACH ROW EXECUTE FUNCTION public.erp_validate_closing_network_accounts();
