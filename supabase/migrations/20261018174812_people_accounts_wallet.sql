ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$');
-- Person account registry retains existing partner IDs and all historical loans.
ALTER TABLE public.business_partners
 ADD COLUMN account_role text NOT NULL DEFAULT 'partner' CHECK(account_role IN ('partner','manager','employee')),
 ADD COLUMN branch_id uuid REFERENCES public.branches(id),
 ADD COLUMN can_submit boolean NOT NULL DEFAULT true,
 ADD COLUMN allow_loans boolean NOT NULL DEFAULT true,
 ADD COLUMN allow_custody boolean NOT NULL DEFAULT false;

CREATE TABLE public.people_enrollment_links (
 restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id),
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, created_by uuid NOT NULL REFERENCES auth.users(id)
);
CREATE TABLE public.people_join_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
 user_id uuid NOT NULL REFERENCES auth.users(id), name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 email text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 account_id uuid REFERENCES public.business_partners(id), created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES auth.users(id), reviewed_at timestamptz, review_note text,
 UNIQUE(restaurant_id,user_id)
);
CREATE TABLE public.people_custody_requests (
 id uuid PRIMARY KEY, person_id uuid NOT NULL REFERENCES public.business_partners(id),
 kind text NOT NULL CHECK(kind IN ('custody_received','custody_returned')),
 amount numeric(14,2) NOT NULL CHECK(amount>0 AND amount<=999999999.99),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), effective_date date NOT NULL,
 payment_method text NOT NULL CHECK(payment_method IN ('cash','network')),
 reference text NOT NULL DEFAULT '' CHECK(length(reference)<=120), notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1000),
 created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reviewed_by uuid REFERENCES auth.users(id), reviewed_at timestamptz, review_note text,
 reverses_id uuid UNIQUE REFERENCES public.people_custody_requests(id),
 counter_transaction_id uuid UNIQUE REFERENCES public.wallet_transactions(id),
 wallet_transaction_id uuid UNIQUE REFERENCES public.wallet_transactions(id)
);
CREATE INDEX people_join_scope ON public.people_join_requests(restaurant_id,status,created_at);
CREATE INDEX people_custody_scope ON public.people_custody_requests(person_id,status,created_at);
ALTER TABLE public.people_enrollment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people_custody_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.people_enrollment_links,public.people_join_requests,public.people_custody_requests FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.erp_configure_person(p_id uuid,p_role text,p_branch uuid,p_submit boolean,p_loans boolean,p_custody boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.business_partners;
BEGIN
 SELECT * INTO p FROM public.business_partners WHERE id=p_id FOR UPDATE;
 IF auth.uid() IS NULL OR NOT FOUND OR NOT coalesce(public.treasury_account_is_owner(p.restaurant_id),false) THEN RAISE EXCEPTION 'PARTNER_OWNER_ONLY' USING ERRCODE='42501'; END IF;
 IF p_role IS NULL OR p_role NOT IN ('partner','manager','employee') OR p_submit IS NULL OR p_loans IS NULL OR p_custody IS NULL THEN RAISE EXCEPTION 'PERSON_INVALID'; END IF;
 IF p_branch IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches WHERE id=p_branch AND restaurant_id=p.restaurant_id AND is_active) THEN RAISE EXCEPTION 'PERSON_BRANCH_INVALID'; END IF;
 -- Changing the label never reclassifies historical money.
 IF p.account_role<>p_role AND (EXISTS(SELECT 1 FROM public.sponsor_owner_transactions WHERE partner_id=p.id) OR EXISTS(SELECT 1 FROM public.people_custody_requests WHERE person_id=p.id AND status='approved')) THEN RAISE EXCEPTION 'PERSON_ROLE_HAS_HISTORY'; END IF;
 UPDATE public.business_partners SET account_role=p_role,branch_id=p_branch,can_submit=p_submit,allow_loans=p_loans,allow_custody=p_custody WHERE id=p.id;
 INSERT INTO public.audit_logs(restaurant_id,action,entity_type,entity_id,new_values,created_by) VALUES(p.restaurant_id,'person_permissions_updated','business_partner',p.id::text,jsonb_build_object('role',p_role,'branch',p_branch,'submit',p_submit,'loans',p_loans,'custody',p_custody),auth.uid()::text);
END; $$;

CREATE FUNCTION public.erp_people_enrollment_link(p_restaurant_id uuid,p_enabled boolean DEFAULT true) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE token text;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.treasury_account_is_owner(p_restaurant_id),false) THEN RAISE EXCEPTION 'PARTNER_OWNER_ONLY' USING ERRCODE='42501';END IF;
 IF p_enabled IS NULL THEN RAISE EXCEPTION 'PERSON_INVALID'; END IF;
 IF NOT p_enabled THEN DELETE FROM public.people_enrollment_links WHERE restaurant_id=p_restaurant_id;RETURN NULL;END IF;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO public.people_enrollment_links VALUES(p_restaurant_id,encode(extensions.digest(token,'sha256'),'hex'),now()+interval '7 days',auth.uid())
 ON CONFLICT(restaurant_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,created_by=excluded.created_by;
 RETURN token;
END; $$;

CREATE FUNCTION public.erp_request_person_account(p_token text,p_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE tenant uuid; u auth.users; r public.people_join_requests;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'PARTNER_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO u FROM auth.users WHERE id=auth.uid();
 IF u.email_confirmed_at IS NULL THEN RAISE EXCEPTION 'PERSON_EMAIL_UNVERIFIED'; END IF;
 SELECT restaurant_id INTO tenant FROM public.people_enrollment_links WHERE token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex') AND expires_at>now();
 IF tenant IS NULL OR NOT EXISTS(SELECT 1 FROM public.restaurants WHERE id=tenant AND coalesce(is_active,true)) THEN RAISE EXCEPTION 'PARTNER_INVITATION_INVALID'; END IF;
 IF coalesce(public.treasury_account_is_owner(tenant),false) THEN RAISE EXCEPTION 'PERSON_OWNER_CANNOT_JOIN'; END IF;
 IF length(trim(coalesce(p_name,''))) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'PERSON_INVALID'; END IF;
 INSERT INTO public.people_join_requests(restaurant_id,user_id,name,email) VALUES(tenant,auth.uid(),trim(p_name),lower(u.email))
 ON CONFLICT(restaurant_id,user_id) DO NOTHING;
 SELECT * INTO r FROM public.people_join_requests WHERE restaurant_id=tenant AND user_id=auth.uid();RETURN r.id;
END; $$;

CREATE FUNCTION public.erp_people_join_requests(p_restaurant_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR (p_restaurant_id IS NOT NULL AND NOT coalesce(public.treasury_account_is_owner(p_restaurant_id),false)) THEN RAISE EXCEPTION 'PARTNER_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 RETURN (SELECT coalesce(jsonb_agg(x ORDER BY created_at DESC),'[]') FROM (SELECT j.id,j.name,j.email,j.status,j.account_id,j.review_note,j.created_at,r.name business FROM public.people_join_requests j JOIN public.restaurants r ON r.id=j.restaurant_id WHERE (p_restaurant_id IS NOT NULL AND j.restaurant_id=p_restaurant_id) OR (p_restaurant_id IS NULL AND j.user_id=auth.uid())) x);
END; $$;

CREATE FUNCTION public.erp_review_person_join(p_id uuid,p_approve boolean,p_role text DEFAULT 'employee',p_branch uuid DEFAULT NULL,p_submit boolean DEFAULT true,p_loans boolean DEFAULT false,p_custody boolean DEFAULT true,p_note text DEFAULT '') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.people_join_requests; p public.business_partners; pid uuid;
BEGIN
 SELECT * INTO r FROM public.people_join_requests WHERE id=p_id FOR UPDATE;
 IF auth.uid() IS NULL OR NOT FOUND OR NOT coalesce(public.treasury_account_is_owner(r.restaurant_id),false) OR r.user_id=auth.uid() THEN RAISE EXCEPTION 'PARTNER_OWNER_ONLY' USING ERRCODE='42501'; END IF;
 IF p_approve IS NULL OR length(coalesce(p_note,''))>1000 THEN RAISE EXCEPTION 'PERSON_INVALID'; END IF;
 IF r.status<>'pending' THEN
 IF (p_approve AND r.status='approved') OR (NOT p_approve AND r.status='rejected') THEN RETURN r.account_id;END IF;
 RAISE EXCEPTION 'PERSON_REQUEST_CLOSED';END IF;
 IF p_approve THEN
  PERFORM pg_advisory_xact_lock(hashtext(r.restaurant_id::text));
  SELECT * INTO p FROM public.business_partners WHERE restaurant_id=r.restaurant_id AND email=r.email FOR UPDATE;
  IF FOUND THEN
   IF p.user_id IS NOT NULL AND p.user_id<>r.user_id THEN RAISE EXCEPTION 'PERSON_IDENTITY_CONFLICT';END IF;pid:=p.id;
  ELSE
   pid:=gen_random_uuid();PERFORM public.erp_save_business_partner(r.restaurant_id,pid,r.name,r.email,true,false);
  END IF;
  PERFORM public.erp_configure_person(pid,p_role,p_branch,p_submit,p_loans,p_custody);
  UPDATE public.business_partners SET user_id=r.user_id,is_active=true WHERE id=pid;
 ELSE
  IF nullif(trim(p_note),'') IS NULL THEN RAISE EXCEPTION 'PERSON_REASON_REQUIRED';END IF;
 END IF;
 UPDATE public.people_join_requests SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,account_id=pid,reviewed_by=auth.uid(),reviewed_at=now(),review_note=trim(p_note) WHERE id=r.id;
 RETURN pid;
END; $$;

CREATE OR REPLACE FUNCTION public.erp_partner_portal_accounts() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'business',r.name,'account_role',p.account_role,'can_submit',p.can_submit,'allow_loans',p.allow_loans,'allow_custody',p.allow_custody,'branch',b.name) ORDER BY r.name,p.name),'[]'::jsonb)
 FROM public.business_partners p JOIN public.restaurants r ON r.id=p.restaurant_id LEFT JOIN public.branches b ON b.id=p.branch_id
 WHERE auth.uid() IS NOT NULL AND p.user_id=auth.uid() AND p.is_active AND coalesce(r.is_active,true);
$$;

CREATE FUNCTION public.erp_submit_custody_request(p_person uuid,p_id uuid,p_kind text,p_amount numeric,p_currency text,p_date date,p_method text,p_reference text DEFAULT '',p_notes text DEFAULT '') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.business_partners; r public.people_custody_requests;
BEGIN
 SELECT bp.* INTO p FROM public.business_partners bp JOIN public.restaurants b ON b.id=bp.restaurant_id WHERE bp.id=p_person AND bp.user_id=auth.uid() AND bp.is_active AND bp.can_submit AND bp.allow_custody AND coalesce(b.is_active,true) FOR SHARE OF bp;
 IF auth.uid() IS NULL OR NOT FOUND THEN RAISE EXCEPTION 'PARTNER_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF p_id IS NULL OR p_kind IS NULL OR p_kind NOT IN('custody_received','custody_returned') OR p_amount IS NULL OR p_amount<=0 OR p_amount>999999999.99 OR p_amount<>round(p_amount,2) OR p_currency IS NULL OR p_currency!~'^[A-Z]{3}$' OR p_date IS NULL OR p_date>(now() AT TIME ZONE 'Asia/Riyadh')::date OR p_method IS NULL OR p_method NOT IN('cash','network') OR length(coalesce(p_reference,''))>120 OR length(coalesce(p_notes,''))>1000 THEN RAISE EXCEPTION 'PERSON_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('custody-request:'||p_id::text,0));
 SELECT * INTO r FROM public.people_custody_requests WHERE id=p_id;
 IF FOUND THEN
 IF r.person_id=p_person AND r.created_by=auth.uid() AND r.kind=p_kind AND r.amount=p_amount AND r.currency=p_currency AND r.effective_date=p_date AND r.payment_method=p_method AND r.reference=trim(coalesce(p_reference,'')) AND r.notes=trim(coalesce(p_notes,'')) THEN RETURN r.id; END IF;
 RAISE EXCEPTION 'PERSON_CONFLICT' USING ERRCODE='23505'; END IF;
 INSERT INTO public.people_custody_requests(id,person_id,kind,amount,currency,effective_date,payment_method,reference,notes,created_by)
 VALUES(p_id,p_person,p_kind,p_amount,p_currency,p_date,p_method,trim(coalesce(p_reference,'')),trim(coalesce(p_notes,'')),auth.uid());RETURN p_id;
END; $$;

CREATE FUNCTION public.erp_person_custody(p_person uuid,p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.business_partners; totals jsonb; rows jsonb; n bigint;
BEGIN
 SELECT bp.* INTO p FROM public.business_partners bp JOIN public.restaurants b ON b.id=bp.restaurant_id WHERE bp.id=p_person AND coalesce(b.is_active,true);
 IF auth.uid() IS NULL OR NOT FOUND OR NOT (coalesce(public.treasury_account_is_owner(p.restaurant_id),false) OR (coalesce(p.user_id=auth.uid(),false) AND p.is_active)) THEN RAISE EXCEPTION 'PARTNER_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF p_offset IS NULL OR p_offset<0 THEN RAISE EXCEPTION 'PERSON_INVALID';END IF;
 SELECT coalesce(jsonb_agg(x),'[]') INTO totals FROM (SELECT currency,payment_method,sum(CASE WHEN status='approved' THEN CASE WHEN kind='custody_received' THEN amount ELSE -amount END ELSE 0 END) held,count(*) FILTER(WHERE status='pending') pending FROM public.people_custody_requests WHERE person_id=p_person GROUP BY currency,payment_method ORDER BY currency,payment_method)x;
 SELECT count(*) INTO n FROM public.people_custody_requests WHERE person_id=p_person;
 SELECT coalesce(jsonb_agg(x ORDER BY created_at DESC,id DESC),'[]') INTO rows FROM (SELECT c.id,c.kind,c.amount,c.currency,c.effective_date,c.payment_method,c.reference,c.notes,c.status,c.created_at,c.reviewed_at,c.review_note,c.reverses_id,(SELECT id FROM public.people_custody_requests z WHERE z.reverses_id=c.id AND z.status='approved') reversed_by FROM public.people_custody_requests c WHERE person_id=p_person ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET p_offset)x;
 RETURN jsonb_build_object('balances',totals,'records',rows,'count',n);
END; $$;

CREATE FUNCTION public.erp_review_custody(p_id uuid,p_approve boolean,p_account uuid DEFAULT NULL,p_note text DEFAULT '') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.people_custody_requests;p public.business_partners;a public.treasury_accounts;held numeric;available numeric;wid uuid;counter_id uuid;method text;wallet text;outgoing boolean;
BEGIN
 SELECT * INTO r FROM public.people_custody_requests WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL THEN RAISE EXCEPTION 'PARTNER_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM public.business_partners WHERE id=r.person_id FOR SHARE;
 IF NOT coalesce(public.treasury_account_is_owner(p.restaurant_id),false) OR (r.created_by=auth.uid() AND r.reverses_id IS NULL) THEN RAISE EXCEPTION 'PARTNER_OWNER_ONLY' USING ERRCODE='42501';END IF;
 IF p_approve IS NULL OR length(coalesce(p_note,''))>1000 THEN RAISE EXCEPTION 'PERSON_INVALID';END IF;
 IF r.status<>'pending' THEN
 IF (p_approve AND r.status='approved') OR (NOT p_approve AND r.status='rejected') THEN RETURN r.id;END IF;RAISE EXCEPTION 'PERSON_REQUEST_CLOSED';END IF;
 IF p_approve THEN
 IF NOT p.is_active OR NOT p.allow_custody OR NOT EXISTS(SELECT 1 FROM public.restaurants WHERE id=p.restaurant_id AND coalesce(is_active,true)) THEN RAISE EXCEPTION 'PARTNER_ACCESS_DENIED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('person-custody:'||p.id::text,0));
 SELECT * INTO a FROM public.treasury_accounts WHERE id=p_account AND restaurant_id=p.restaurant_id AND currency=r.currency AND is_active AND branch_id IS NULL AND branch_key IS NULL FOR UPDATE;
 IF NOT FOUND OR (a.legacy_wallet_key IS NOT NULL AND a.legacy_wallet_key NOT IN('owner_cash','owner_network')) THEN RAISE EXCEPTION 'PERSON_ACCOUNT_INVALID';END IF;
 method:=CASE WHEN a.legacy_wallet_key='owner_cash' THEN 'cash' WHEN a.legacy_wallet_key='owner_network' OR a.account_type IN('bank','network_pos','digital_wallet','clearing') THEN 'network' ELSE 'cash' END;
 IF method<>r.payment_method THEN RAISE EXCEPTION 'PERSON_METHOD_INVALID';END IF;
 outgoing:=r.kind='custody_received';wallet:=CASE WHEN method='cash' THEN 'owner_cash' ELSE 'owner_network' END;
 IF outgoing THEN
 SELECT a.opening_balance+coalesce(sum(CASE WHEN direction='in' THEN amount WHEN direction='out' THEN -amount ELSE 0 END),0) INTO available FROM public.wallet_transactions WHERE account_id=a.id AND restaurant_id=p.restaurant_id;
 IF coalesce(available,0)<r.amount THEN RAISE EXCEPTION 'PERSON_INSUFFICIENT_FUNDS';END IF;
 ELSE
 SELECT coalesce(sum(CASE WHEN kind='custody_received' THEN amount ELSE -amount END),0) INTO held FROM public.people_custody_requests WHERE person_id=p.id AND currency=r.currency AND payment_method=r.payment_method AND status='approved';
 IF held<r.amount THEN RAISE EXCEPTION 'PERSON_RETURN_EXCEEDS_HELD';END IF;
 END IF;
 INSERT INTO public.wallet_transactions(currency,restaurant_id,transaction_date,transaction_type,direction,wallet,amount,payment_method,account_id,description,reference_id,auto_generated,recorded_by,created_by)
 VALUES(r.currency,p.restaurant_id,r.effective_date,'transfer',CASE WHEN outgoing THEN 'out' ELSE 'in' END,wallet,r.amount,method,a.id,'Person custody: '||p.name,'person_custody:'||r.id,true,auth.jwt()->>'email',auth.jwt()->>'email') RETURNING id INTO wid;
 -- A custody handover is an internal transfer: the person leg preserves total business cash.
 INSERT INTO public.wallet_transactions(currency,restaurant_id,branch_id,branch,transaction_date,transaction_type,direction,wallet,amount,payment_method,description,reference_id,auto_generated,recorded_by,created_by)
 VALUES(r.currency,p.restaurant_id,p.branch_id,(SELECT branch_key FROM public.branches WHERE id=p.branch_id),r.effective_date,'transfer',CASE WHEN outgoing THEN 'in' ELSE 'out' END,'person_custody',r.amount,method,'Custody held by: '||p.name,'person_custody_counter:'||r.id,true,auth.jwt()->>'email',auth.jwt()->>'email') RETURNING id INTO counter_id;

 ELSE
 IF nullif(trim(p_note),'') IS NULL THEN RAISE EXCEPTION 'PERSON_REASON_REQUIRED';END IF;
 END IF;
 UPDATE public.people_custody_requests SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,reviewed_by=auth.uid(),reviewed_at=now(),review_note=trim(p_note),wallet_transaction_id=wid,counter_transaction_id=counter_id WHERE id=r.id;
 RETURN r.id;
END; $$;
-- Clients cannot mutate approved custody journals or any join authorization rows directly.
CREATE FUNCTION public.erp_people_custody_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.status<>'pending' THEN RAISE EXCEPTION 'PERSON_POSTED_IMMUTABLE'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
CREATE TRIGGER people_custody_immutable BEFORE UPDATE OR DELETE ON public.people_custody_requests FOR EACH ROW EXECUTE FUNCTION public.erp_people_custody_immutable();

-- Existing APIs gain the same server-side permissions; old clients cannot bypass flags.
DO $$ DECLARE def text; BEGIN
 def:=pg_get_functiondef('public.erp_submit_partner_request(uuid,uuid,text,numeric,text,date,text,text,text)'::regprocedure);
 def:=replace(def,'bp.is_active AND','bp.is_active AND bp.can_submit AND bp.allow_loans AND');EXECUTE def;
 def:=pg_get_functiondef('public.erp_post_partner_transaction(uuid,uuid,uuid,text,numeric,date,uuid,text,text,text)'::regprocedure);
 def:=replace(def,'AND restaurant_id=p_restaurant_id AND is_active FOR SHARE','AND restaurant_id=p_restaurant_id AND is_active AND allow_loans FOR SHARE');
 def:=replace(def,'NOT public.treasury_account_is_owner(p_restaurant_id)','NOT coalesce(public.treasury_account_is_owner(p_restaurant_id),false)');EXECUTE def;
 def:=pg_get_functiondef('public.erp_save_business_partner(uuid,uuid,text,text,boolean,boolean)'::regprocedure);
 def:=replace(def,'NOT public.treasury_account_is_owner(p_restaurant_id)','NOT coalesce(public.treasury_account_is_owner(p_restaurant_id),false)');
 def:=replace(def,'SELECT count(*) INTO v_used FROM public.business_partners WHERE restaurant_id=p_restaurant_id;', 'SELECT count(*) INTO v_used FROM public.business_partners bp WHERE bp.restaurant_id=p_restaurant_id AND NOT EXISTS(SELECT 1 FROM public.erp_memberships m WHERE m.restaurant_id=bp.restaurant_id AND lower(m.email)=bp.email AND m.status IN (''approved'',''pending''));');
 def:=replace(def,'IF v_used>=v_limit THEN', 'IF v_used>=v_limit AND NOT EXISTS(SELECT 1 FROM public.erp_memberships m WHERE m.restaurant_id=p_restaurant_id AND lower(m.email)=lower(trim(p_email)) AND m.status IN (''approved'',''pending'')) THEN');EXECUTE def;
 -- Public signup creates identity only. User metadata never grants ERP privileges.
 def:=pg_get_functiondef('public.handle_new_user()'::regprocedure);
 def:=replace(def,'  invitation_token :=', E'  IF NEW.raw_user_meta_data->>''people_portal_registration'' = ''true'' THEN\n    UPDATE auth.users SET raw_user_meta_data=coalesce(NEW.raw_user_meta_data,''{}''::jsonb)-''role''-''restaurant_id''-''branch_id''-''people_portal_registration'' WHERE id=NEW.id;\n    RETURN NEW;\n  END IF;\n\n  invitation_token :=');EXECUTE def;
END; $$;
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('erp_configure_person','erp_people_enrollment_link','erp_request_person_account','erp_people_join_requests','erp_review_person_join','erp_submit_custody_request','erp_person_custody','erp_review_custody','erp_people_custody_immutable') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f);
 IF f::text NOT LIKE '%immutable%' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f);END IF;
 END LOOP;
END; $$;
CREATE FUNCTION public.erp_save_person_account(p_restaurant_id uuid,p_id uuid,p_name text,p_email text,p_active boolean,p_invite boolean,p_role text,p_branch uuid,p_submit boolean,p_loans boolean,p_custody boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 result:=public.erp_save_business_partner(p_restaurant_id,p_id,p_name,p_email,p_active,p_invite);
 PERFORM public.erp_configure_person(p_id,p_role,p_branch,p_submit,p_loans,p_custody);
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.erp_save_person_account(uuid,uuid,text,text,boolean,boolean,text,uuid,boolean,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_save_person_account(uuid,uuid,text,text,boolean,boolean,text,uuid,boolean,boolean,boolean) TO authenticated;

-- Corrections append the exact opposite movement; original posted records remain unchanged.
CREATE FUNCTION public.erp_reverse_custody(p_id uuid,p_note text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.people_custody_requests;p public.business_partners;rid uuid;account uuid;
BEGIN
 SELECT * INTO r FROM public.people_custody_requests WHERE id=p_id FOR UPDATE;
 IF auth.uid() IS NULL OR NOT FOUND THEN RAISE EXCEPTION 'PARTNER_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM public.business_partners WHERE id=r.person_id;
 IF NOT coalesce(public.treasury_account_is_owner(p.restaurant_id),false) THEN RAISE EXCEPTION 'PARTNER_OWNER_ONLY' USING ERRCODE='42501';END IF;
 IF r.status<>'approved' OR r.reverses_id IS NOT NULL OR nullif(trim(p_note),'') IS NULL OR length(p_note)>1000 THEN RAISE EXCEPTION 'PERSON_INVALID';END IF;
 SELECT id INTO rid FROM public.people_custody_requests WHERE reverses_id=r.id;IF FOUND THEN RETURN rid;END IF;
 SELECT account_id INTO account FROM public.wallet_transactions WHERE id=r.wallet_transaction_id;
 rid:=gen_random_uuid();
 INSERT INTO public.people_custody_requests(id,person_id,kind,amount,currency,effective_date,payment_method,reference,notes,created_by,reverses_id)
 VALUES(rid,r.person_id,CASE WHEN r.kind='custody_received' THEN 'custody_returned' ELSE 'custody_received' END,r.amount,r.currency,(now() AT TIME ZONE 'Asia/Riyadh')::date,r.payment_method,'reversal:'||r.id,trim(p_note),auth.uid(),r.id);
 PERFORM public.erp_review_custody(rid,true,account,p_note);RETURN rid;
END; $$;
REVOKE ALL ON FUNCTION public.erp_reverse_custody(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_reverse_custody(uuid,text) TO authenticated;

CREATE FUNCTION public.erp_people_custody_totals(p_restaurant_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.treasury_account_is_owner(p_restaurant_id),false) THEN RAISE EXCEPTION 'PARTNER_OWNER_ONLY' USING ERRCODE='42501';END IF;
 RETURN (SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT c.currency,c.payment_method,sum(CASE WHEN c.status='approved' THEN CASE WHEN c.kind='custody_received' THEN c.amount ELSE -c.amount END ELSE 0 END) held,count(*) FILTER(WHERE c.status='pending') pending FROM public.people_custody_requests c JOIN public.business_partners p ON p.id=c.person_id WHERE p.restaurant_id=p_restaurant_id GROUP BY c.currency,c.payment_method ORDER BY c.currency,c.payment_method)x);
END; $$;
REVOKE ALL ON FUNCTION public.erp_people_custody_totals(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_people_custody_totals(uuid) TO authenticated;
CREATE FUNCTION public.erp_people_wallet_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.reference_id LIKE 'person_custody:%' OR OLD.reference_id LIKE 'person_custody_counter:%' THEN RAISE EXCEPTION 'PERSON_POSTED_IMMUTABLE';END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
REVOKE ALL ON FUNCTION public.erp_people_wallet_immutable() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER people_wallet_immutable BEFORE UPDATE OR DELETE ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION public.erp_people_wallet_immutable();
