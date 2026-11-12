-- Per-person wallet enrollment is independent of the legacy organization-wide
-- link. Issuing a token NEVER creates an account, posts money, or grants access.
-- The recipient must verify the SAME email and explicitly request membership.
CREATE TABLE IF NOT EXISTS public.people_personal_enrollment_links (
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  source_type text NOT NULL CHECK(source_type IN ('manager','employee','driver','supplier','customer')),
  source_id uuid NOT NULL,
  invited_email text NOT NULL CHECK(length(trim(invited_email)) BETWEEN 3 AND 254),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id,source_type,source_id)
);
CREATE INDEX IF NOT EXISTS people_personal_enrollment_expires_idx
  ON public.people_personal_enrollment_links(expires_at);
ALTER TABLE public.people_personal_enrollment_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.people_personal_enrollment_links FROM PUBLIC,anon,authenticated;

-- An Owner-only, tenant-scoped directory. Never expose cross-tenant identities
-- to an unverified or non-Owner browser, and do not return authorization secrets.
CREATE OR REPLACE FUNCTION public.erp_wallet_candidate_directory(p_restaurant_id uuid)
RETURNS TABLE(source_type text,source_id uuid,full_name text,email text,branch_id uuid,status text,wallet_linked boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR p_restaurant_id IS NULL
   OR NOT coalesce(public.treasury_account_is_owner(p_restaurant_id),false)
 THEN RAISE EXCEPTION 'PARTNER_OWNER_ONLY' USING ERRCODE='42501'; END IF;
 RETURN QUERY
 SELECT t.kind,t.person_id,t.name,t.person_email,t.person_branch,t.person_status,
   EXISTS (SELECT 1 FROM public.business_partners bp
    WHERE bp.restaurant_id=p_restaurant_id AND bp.user_id IS NOT NULL
      AND lower(trim(bp.email))=lower(trim(t.person_email))) AS wallet_linked
 FROM (
   SELECT 'manager'::text kind,m.id person_id,coalesce(nullif(trim(m.full_name),''),m.email,'—') name,
    nullif(lower(trim(m.email)),'') person_email,m.branch_id person_branch,m.status::text person_status
   FROM public.erp_memberships m WHERE m.restaurant_id=p_restaurant_id AND m.role='manager'
   UNION ALL
   SELECT 'employee',e.id,coalesce(nullif(trim(e.full_name),''),e.email,'—'),
    nullif(lower(trim(e.email)),''),e.branch_id,
    CASE WHEN e.is_active IS FALSE THEN 'inactive' ELSE 'active' END
   FROM public.employees e WHERE e.restaurant_id=p_restaurant_id
   UNION ALL
   SELECT 'driver',d.id,coalesce(nullif(trim(d.full_name),''),d.email,'—'),
    nullif(lower(trim(d.email)),''),d.branch_id,
    CASE WHEN d.is_active IS FALSE THEN 'inactive' ELSE 'active' END
   FROM public.drivers d WHERE d.restaurant_id=p_restaurant_id
   UNION ALL
   SELECT 'supplier',s.id,coalesce(nullif(trim(s.name),''),s.email,'—'),
    nullif(lower(trim(s.email)),''),s.branch_id,
    CASE WHEN s.status IS FALSE THEN 'inactive' ELSE 'active' END
   FROM public.suppliers s WHERE s.restaurant_id=p_restaurant_id
   UNION ALL
   SELECT 'customer',c.id,coalesce(nullif(trim(c.name),''),c.email,'—'),
    nullif(lower(trim(c.email)),''),c.branch_id,
    CASE WHEN c.is_active IS FALSE THEN 'inactive' ELSE 'active' END
   FROM public.customers c WHERE c.restaurant_id=p_restaurant_id
 ) t ORDER BY t.kind,t.name,t.person_id;
END; $$;

-- Each click rotates only this selected person's link. Earlier links for
-- different individuals or the organization-wide enrollment remain valid.
CREATE OR REPLACE FUNCTION public.erp_people_personal_enrollment_link(
 p_restaurant_id uuid,p_source_type text,p_source_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE v_email text; v_status text; v_token text;
BEGIN
 IF auth.uid() IS NULL OR p_restaurant_id IS NULL
   OR NOT coalesce(public.treasury_account_is_owner(p_restaurant_id),false)
 THEN RAISE EXCEPTION 'PARTNER_OWNER_ONLY' USING ERRCODE='42501'; END IF;
 IF p_source_id IS NULL OR p_source_type NOT IN ('manager','employee','driver','supplier','customer')
 THEN RAISE EXCEPTION 'WALLET_INVITEE_INVALID'; END IF;
 CASE p_source_type
 WHEN 'manager' THEN
   SELECT nullif(lower(trim(m.email)),''),m.status INTO v_email,v_status FROM public.erp_memberships m
    WHERE m.id=p_source_id AND m.restaurant_id=p_restaurant_id AND m.role='manager';
 WHEN 'employee' THEN
   SELECT nullif(lower(trim(e.email)),''), CASE WHEN e.is_active IS FALSE THEN 'inactive' ELSE 'active' END
    INTO v_email,v_status FROM public.employees e WHERE e.id=p_source_id AND e.restaurant_id=p_restaurant_id;
 WHEN 'driver' THEN
   SELECT nullif(lower(trim(d.email)),''), CASE WHEN d.is_active IS FALSE THEN 'inactive' ELSE 'active' END
    INTO v_email,v_status FROM public.drivers d WHERE d.id=p_source_id AND d.restaurant_id=p_restaurant_id;
 WHEN 'supplier' THEN
   SELECT nullif(lower(trim(s.email)),''), CASE WHEN s.status IS FALSE THEN 'inactive' ELSE 'active' END
    INTO v_email,v_status FROM public.suppliers s WHERE s.id=p_source_id AND s.restaurant_id=p_restaurant_id;
 WHEN 'customer' THEN
   SELECT nullif(lower(trim(c.email)),''), CASE WHEN c.is_active IS FALSE THEN 'inactive' ELSE 'active' END
    INTO v_email,v_status FROM public.customers c WHERE c.id=p_source_id AND c.restaurant_id=p_restaurant_id;
 END CASE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_INVITEE_NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF v_email IS NULL OR v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 THEN RAISE EXCEPTION 'WALLET_INVITEE_EMAIL_REQUIRED'; END IF;
 IF (p_source_type='manager' AND v_status IS DISTINCT FROM 'approved') OR v_status='inactive'
 THEN RAISE EXCEPTION 'WALLET_INVITEE_NOT_ACTIVE' USING ERRCODE='42501'; END IF;
 IF EXISTS (SELECT 1 FROM public.business_partners b WHERE b.restaurant_id=p_restaurant_id
       AND b.user_id IS NOT NULL AND lower(trim(b.email))=v_email)
 THEN RAISE EXCEPTION 'WALLET_ACCOUNT_ALREADY_LINKED'; END IF;
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO public.people_personal_enrollment_links
  (restaurant_id,source_type,source_id,invited_email,token_hash,expires_at,created_by)
 VALUES(p_restaurant_id,p_source_type,p_source_id,v_email,
   encode(extensions.digest(v_token,'sha256'),'hex'),now()+interval '7 days',auth.uid())
 ON CONFLICT(restaurant_id,source_type,source_id) DO UPDATE
 SET invited_email=excluded.invited_email,token_hash=excluded.token_hash,
     expires_at=excluded.expires_at,consumed_at=NULL,created_by=excluded.created_by,
     created_at=now();
 RETURN v_token;
END; $$;

-- A dedicated accept path avoids touching the existing organization-wide join
-- function. The one-time token is bound to the recipient's VERIFIED Auth email.
-- This function only creates a pending request; Owner approval is still required.
CREATE OR REPLACE FUNCTION public.erp_request_person_named_account(p_token text,p_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE v_link public.people_personal_enrollment_links; v_user auth.users; v_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'PARTNER_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_user FROM auth.users WHERE id=auth.uid();
 IF NOT FOUND OR v_user.email_confirmed_at IS NULL THEN RAISE EXCEPTION 'PERSON_EMAIL_UNVERIFIED' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(p_name,''))) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'PERSON_INVALID'; END IF;
 IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'PARTNER_INVITATION_INVALID' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_link FROM public.people_personal_enrollment_links
  WHERE token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
   AND expires_at>now() AND consumed_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.restaurants r
     WHERE r.id=v_link.restaurant_id AND coalesce(r.is_active,true))
 THEN RAISE EXCEPTION 'PARTNER_INVITATION_INVALID' USING ERRCODE='42501'; END IF;
 IF lower(trim(v_user.email))<>lower(trim(v_link.invited_email))
 THEN RAISE EXCEPTION 'WALLET_INVITEE_EMAIL_MISMATCH' USING ERRCODE='42501'; END IF;
 IF coalesce(public.treasury_account_is_owner(v_link.restaurant_id),false)
 THEN RAISE EXCEPTION 'PERSON_OWNER_CANNOT_JOIN' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.business_partners b WHERE b.restaurant_id=v_link.restaurant_id
  AND b.user_id=auth.uid()) THEN RAISE EXCEPTION 'WALLET_ACCOUNT_ALREADY_LINKED'; END IF;
 INSERT INTO public.people_join_requests(restaurant_id,user_id,name,email)
 VALUES(v_link.restaurant_id,auth.uid(),trim(p_name),lower(v_user.email))
 ON CONFLICT(restaurant_id,user_id) DO NOTHING;
 SELECT id INTO v_id FROM public.people_join_requests
  WHERE restaurant_id=v_link.restaurant_id AND user_id=auth.uid();
 UPDATE public.people_personal_enrollment_links SET consumed_at=now()
  WHERE restaurant_id=v_link.restaurant_id AND source_type=v_link.source_type AND source_id=v_link.source_id;
 RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.erp_wallet_candidate_directory(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.erp_people_personal_enrollment_link(uuid,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.erp_request_person_named_account(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_wallet_candidate_directory(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_people_personal_enrollment_link(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_request_person_named_account(text,text) TO authenticated;
