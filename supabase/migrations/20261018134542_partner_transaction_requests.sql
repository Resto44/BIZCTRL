-- Partner-authored requests do not move money. Only the owner posts the ledger.
CREATE TABLE public.partner_transaction_requests (
 id uuid PRIMARY KEY,
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
 partner_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('sponsor_advance_to_owner','owner_repay_sponsor','owner_advance_to_sponsor','sponsor_repay_owner')),
 amount numeric(14,2) NOT NULL CHECK(amount>0 AND amount<=999999999.99),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 effective_date date NOT NULL,
 payment_method text NOT NULL CHECK(payment_method IN ('cash','network')),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1000),
 external_reference text NOT NULL DEFAULT '' CHECK(length(external_reference)<=120),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES auth.users(id), reviewed_at timestamptz, review_note text,
 posting_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 FOREIGN KEY(partner_id,restaurant_id) REFERENCES public.business_partners(id,restaurant_id)
);
ALTER TABLE public.partner_transaction_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_transaction_requests FROM anon,authenticated;
CREATE INDEX partner_requests_scope ON public.partner_transaction_requests(partner_id,created_at DESC,id DESC);
CREATE INDEX partner_requests_tenant ON public.partner_transaction_requests(restaurant_id,status);

CREATE FUNCTION public.erp_submit_partner_request(p_partner_id uuid,p_request_id uuid,p_kind text,p_amount numeric,p_currency text,p_date date,p_method text,p_notes text DEFAULT '',p_reference text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.business_partners; r public.partner_transaction_requests;
BEGIN
 SELECT bp.* INTO p FROM public.business_partners bp JOIN public.restaurants b ON b.id=bp.restaurant_id
 WHERE bp.id=p_partner_id AND bp.user_id=auth.uid() AND bp.is_active AND coalesce(b.is_active,true) FOR SHARE OF bp;
 IF auth.uid() IS NULL OR NOT FOUND THEN RAISE EXCEPTION 'PARTNER_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_kind IS NULL OR p_kind NOT IN('sponsor_advance_to_owner','owner_repay_sponsor','owner_advance_to_sponsor','sponsor_repay_owner') OR p_amount IS NULL OR p_amount<=0 OR p_amount>999999999.99 OR p_amount<>round(p_amount,2) OR p_currency IS NULL OR p_currency!~'^[A-Z]{3}$' OR p_date IS NULL OR p_date>(now() AT TIME ZONE 'Asia/Riyadh')::date OR p_method IS NULL OR p_method NOT IN('cash','network') OR length(coalesce(p_notes,''))>1000 OR length(coalesce(p_reference,''))>120 THEN RAISE EXCEPTION 'PARTNER_REQUEST_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('partner_request:'||p_request_id::text,0));
 SELECT * INTO r FROM public.partner_transaction_requests WHERE id=p_request_id;
 IF FOUND THEN
  IF r.partner_id=p_partner_id AND r.created_by=auth.uid() AND r.kind=p_kind AND r.amount=p_amount AND r.currency=p_currency AND r.effective_date=p_date AND r.payment_method=p_method AND r.notes=coalesce(trim(p_notes),'') AND r.external_reference=coalesce(trim(p_reference),'') THEN RETURN jsonb_build_object('id',r.id,'status',r.status); END IF;
  RAISE EXCEPTION 'PARTNER_REQUEST_CONFLICT' USING ERRCODE='23505';
 END IF;
 INSERT INTO public.partner_transaction_requests(id,restaurant_id,partner_id,kind,amount,currency,effective_date,payment_method,notes,external_reference,created_by)
 VALUES(p_request_id,p.restaurant_id,p_partner_id,p_kind,p_amount,p_currency,p_date,p_method,coalesce(trim(p_notes),''),coalesce(trim(p_reference),''),auth.uid()) RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'status',r.status);
END; $$;

CREATE FUNCTION public.erp_list_partner_requests(p_partner_id uuid,p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.business_partners; rows jsonb; total bigint;
BEGIN
 SELECT bp.* INTO p FROM public.business_partners bp JOIN public.restaurants b ON b.id=bp.restaurant_id WHERE bp.id=p_partner_id AND coalesce(b.is_active,true);
 IF auth.uid() IS NULL OR NOT FOUND OR NOT (public.treasury_account_is_owner(p.restaurant_id) OR (p.user_id=auth.uid() AND p.is_active)) THEN RAISE EXCEPTION 'PARTNER_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF p_offset IS NULL OR p_offset<0 THEN RAISE EXCEPTION 'PARTNER_REQUEST_INVALID'; END IF;
 SELECT count(*) INTO total FROM public.partner_transaction_requests WHERE partner_id=p_partner_id;
 SELECT coalesce(jsonb_agg(x ORDER BY created_at DESC,id DESC),'[]') INTO rows FROM (
 SELECT id,kind,amount,currency,effective_date,payment_method,notes,external_reference,status,created_at,reviewed_at,review_note FROM public.partner_transaction_requests WHERE partner_id=p_partner_id ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET p_offset
 ) x;
 RETURN jsonb_build_object('records',rows,'count',total);
END; $$;

CREATE FUNCTION public.erp_review_partner_request(p_request_id uuid,p_approve boolean,p_account_id uuid DEFAULT NULL,p_note text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.partner_transaction_requests; a public.treasury_accounts; method text;
BEGIN
 SELECT * INTO r FROM public.partner_transaction_requests WHERE id=p_request_id FOR UPDATE;
 IF auth.uid() IS NULL OR NOT FOUND OR NOT public.treasury_account_is_owner(r.restaurant_id) THEN RAISE EXCEPTION 'PARTNER_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
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
REVOKE ALL ON FUNCTION public.erp_submit_partner_request(uuid,uuid,text,numeric,text,date,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.erp_list_partner_requests(uuid,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.erp_review_partner_request(uuid,boolean,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_submit_partner_request(uuid,uuid,text,numeric,text,date,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_list_partner_requests(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_review_partner_request(uuid,boolean,uuid,text) TO authenticated;
