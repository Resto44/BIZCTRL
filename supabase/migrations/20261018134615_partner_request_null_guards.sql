CREATE OR REPLACE FUNCTION public.erp_list_partner_requests(p_partner_id uuid,p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.business_partners; rows jsonb; total bigint;
BEGIN
 SELECT bp.* INTO p FROM public.business_partners bp JOIN public.restaurants b ON b.id=bp.restaurant_id WHERE bp.id=p_partner_id AND coalesce(b.is_active,true);
 IF auth.uid() IS NULL OR NOT FOUND OR NOT (coalesce(public.treasury_account_is_owner(p.restaurant_id),false) OR (p.user_id=auth.uid() AND p.is_active)) THEN RAISE EXCEPTION 'PARTNER_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF p_offset IS NULL OR p_offset<0 THEN RAISE EXCEPTION 'PARTNER_REQUEST_INVALID'; END IF;
 SELECT count(*) INTO total FROM public.partner_transaction_requests WHERE partner_id=p_partner_id;
 SELECT coalesce(jsonb_agg(x ORDER BY created_at DESC,id DESC),'[]') INTO rows FROM (
 SELECT id,kind,amount,currency,effective_date,payment_method,notes,external_reference,status,created_at,reviewed_at,review_note FROM public.partner_transaction_requests WHERE partner_id=p_partner_id ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET p_offset
 ) x;
 RETURN jsonb_build_object('records',rows,'count',total);
END; $$;

CREATE OR REPLACE FUNCTION public.erp_review_partner_request(p_request_id uuid,p_approve boolean,p_account_id uuid DEFAULT NULL,p_note text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.partner_transaction_requests; a public.treasury_accounts; method text;
BEGIN
 SELECT * INTO r FROM public.partner_transaction_requests WHERE id=p_request_id FOR UPDATE;
 IF auth.uid() IS NULL OR NOT FOUND OR NOT coalesce(public.treasury_account_is_owner(r.restaurant_id),false) THEN RAISE EXCEPTION 'PARTNER_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF p_approve IS NULL OR length(coalesce(p_note,''))>1000 THEN RAISE EXCEPTION 'PARTNER_REQUEST_INVALID'; END IF;
 IF r.status<>'pending' THEN
  IF (p_approve AND r.status='approved') OR (NOT p_approve AND r.status='rejected') THEN RETURN jsonb_build_object('id',r.id,'status',r.status); END IF;
  RAISE EXCEPTION 'PARTNER_REQUEST_CLOSED';
 END IF;
 IF p_approve THEN
  SELECT * INTO a FROM public.treasury_accounts WHERE id=p_account_id AND restaurant_id=r.restaurant_id AND currency=r.currency AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERP_SPONSOR_OWNER_ACCOUNT_INVALID'; END IF;
  method:=CASE WHEN a.legacy_wallet_key='owner_cash' THEN 'cash' WHEN a.legacy_wallet_key='owner_network' THEN 'network' WHEN a.account_type IN('bank','network_pos','digital_wallet','clearing') THEN 'network' ELSE 'cash' END;
  IF method<>r.payment_method THEN RAISE EXCEPTION 'ERP_SPONSOR_OWNER_ACCOUNT_INVALID'; END IF;
  PERFORM public.erp_post_partner_transaction(r.restaurant_id,r.partner_id,a.id,r.kind,r.amount,r.effective_date,r.posting_id,nullif(r.notes,''),nullif(r.external_reference,''),NULL);
 ELSE
  IF nullif(trim(p_note),'') IS NULL THEN RAISE EXCEPTION 'PARTNER_REQUEST_REASON_REQUIRED'; END IF;
 END IF;
 UPDATE public.partner_transaction_requests SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,reviewed_by=auth.uid(),reviewed_at=now(),review_note=coalesce(trim(p_note),'') WHERE id=r.id RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'status',r.status);
END; $$;
