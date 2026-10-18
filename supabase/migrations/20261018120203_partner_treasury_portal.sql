-- Isolated external partner accounts: no staff membership or branch-wide grants.
CREATE TABLE public.business_partners (
 id uuid PRIMARY KEY, restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
 email text NOT NULL CHECK (length(email) <= 254 AND email = lower(trim(email)) AND position('@' in email)>1),
 user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 is_active boolean NOT NULL DEFAULT true, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(restaurant_id,id), UNIQUE(restaurant_id,email)
);
CREATE INDEX business_partners_user_idx ON public.business_partners(user_id) WHERE user_id IS NOT NULL;
ALTER TABLE public.business_partners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_partners FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.business_partners TO authenticated;
CREATE POLICY business_partners_owner_read ON public.business_partners FOR SELECT TO authenticated
 USING (public.treasury_account_is_owner(restaurant_id));

CREATE TABLE public.partner_portal_invitations (
 partner_id uuid PRIMARY KEY REFERENCES public.business_partners(id),
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
 created_by uuid NOT NULL, accepted_at timestamptz
);
ALTER TABLE public.partner_portal_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_portal_invitations FROM PUBLIC,anon,authenticated;

ALTER TABLE public.sponsor_owner_transactions ADD COLUMN partner_id uuid;
ALTER TABLE public.sponsor_owner_transactions ADD CONSTRAINT sponsor_owner_partner_tenant_fk
 FOREIGN KEY(restaurant_id,partner_id) REFERENCES public.business_partners(restaurant_id,id) ON DELETE RESTRICT;
CREATE INDEX sponsor_owner_partner_currency_idx ON public.sponsor_owner_transactions(restaurant_id,partner_id,currency,effective_date,id);

CREATE TABLE public.partner_transaction_confirmations (
 transaction_id uuid PRIMARY KEY REFERENCES public.sponsor_owner_transactions(id),
 user_id uuid NOT NULL REFERENCES auth.users(id), confirmed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.partner_transaction_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_transaction_confirmations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.partner_transaction_confirmations TO authenticated;
CREATE POLICY partner_confirmation_owner_read ON public.partner_transaction_confirmations FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.sponsor_owner_transactions t WHERE t.id=transaction_id
 AND public.treasury_account_is_owner(t.restaurant_id)));

-- Owner issues/renews a token. Creating records is idempotent by caller UUID.
CREATE FUNCTION public.erp_save_business_partner(p_restaurant_id uuid,p_partner_id uuid,p_name text,p_email text,p_active boolean DEFAULT true,p_invite boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE v_partner public.business_partners; v_token text; v_capacity jsonb; v_used bigint; v_limit bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT public.treasury_account_is_owner(p_restaurant_id) THEN RAISE EXCEPTION 'PARTNER_OWNER_ONLY' USING ERRCODE='42501'; END IF;
 IF p_partner_id IS NULL OR p_active IS NULL OR length(trim(coalesce(p_name,''))) NOT BETWEEN 1 AND 120
 OR length(trim(coalesce(p_email,'')))>254 OR trim(coalesce(p_email,'')) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 THEN RAISE EXCEPTION 'PARTNER_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_restaurant_id::text));
 SELECT * INTO v_partner FROM public.business_partners WHERE id=p_partner_id FOR UPDATE;
 IF FOUND THEN
  IF v_partner.restaurant_id<>p_restaurant_id THEN RAISE EXCEPTION 'PARTNER_OWNER_ONLY' USING ERRCODE='42501'; END IF;
  IF v_partner.email<>lower(trim(p_email)) THEN RAISE EXCEPTION 'PARTNER_EMAIL_IMMUTABLE'; END IF;
 ELSE
  v_capacity:=public.erp_subscription_capacity_state(p_restaurant_id,true);
  SELECT count(*) INTO v_used FROM public.business_partners WHERE restaurant_id=p_restaurant_id;
  v_used:=v_used+coalesce((v_capacity->'usage'->>'users')::bigint,0);
  v_limit:=coalesce((v_capacity->'limits'->>'users')::bigint,0);
  IF v_used>=v_limit THEN RAISE EXCEPTION 'SUBSCRIPTION_LIMIT_REACHED'; END IF;
 END IF;
 INSERT INTO public.business_partners(id,restaurant_id,name,email,is_active,created_by)
 VALUES(p_partner_id,p_restaurant_id,trim(p_name),lower(trim(p_email)),p_active,auth.uid())
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,is_active=excluded.is_active
 RETURNING * INTO v_partner;
 IF p_invite AND p_active AND v_partner.user_id IS NULL THEN
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO public.partner_portal_invitations(partner_id,token_hash,expires_at,created_by)
  VALUES(p_partner_id,encode(extensions.digest(v_token,'sha256'),'hex'),now()+interval '7 days',auth.uid())
  ON CONFLICT(partner_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,created_by=excluded.created_by,accepted_at=NULL;
 END IF;
 INSERT INTO public.audit_logs(restaurant_id,action,entity_type,entity_id,new_values,created_by)
 VALUES(p_restaurant_id,'partner_updated','business_partner',p_partner_id::text,
 jsonb_build_object('name',v_partner.name,'active',p_active,'invitation_issued',v_token IS NOT NULL),auth.uid()::text);
 RETURN jsonb_build_object('partner',to_jsonb(v_partner),'token',v_token);
END; $$;
REVOKE ALL ON FUNCTION public.erp_save_business_partner(uuid,uuid,text,text,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_save_business_partner(uuid,uuid,text,text,boolean,boolean) TO authenticated;

CREATE FUNCTION public.erp_accept_partner_invitation(p_token text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE v_inv public.partner_portal_invitations; v_partner public.business_partners; v_email text; v_verified timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'PARTNER_AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_inv FROM public.partner_portal_invitations WHERE token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex') FOR UPDATE;
 IF NOT FOUND OR v_inv.expires_at<=now() THEN RAISE EXCEPTION 'PARTNER_INVITATION_INVALID'; END IF;
 SELECT * INTO v_partner FROM public.business_partners WHERE id=v_inv.partner_id FOR UPDATE;
 SELECT email,email_confirmed_at INTO v_email,v_verified FROM auth.users WHERE id=auth.uid();
 IF NOT v_partner.is_active OR v_verified IS NULL OR lower(v_email) IS DISTINCT FROM v_partner.email
 OR (v_partner.user_id IS NOT NULL AND v_partner.user_id<>auth.uid()) THEN RAISE EXCEPTION 'PARTNER_IDENTITY_MISMATCH' USING ERRCODE='42501'; END IF;
 UPDATE public.business_partners SET user_id=auth.uid() WHERE id=v_partner.id;
 UPDATE public.partner_portal_invitations SET accepted_at=coalesce(accepted_at,now()) WHERE partner_id=v_partner.id;
 INSERT INTO public.audit_logs(restaurant_id,action,entity_type,entity_id,created_by)
 VALUES(v_partner.restaurant_id,'partner_activated','business_partner',v_partner.id::text,auth.uid()::text);
 RETURN v_partner.id;
END; $$;
REVOKE ALL ON FUNCTION public.erp_accept_partner_invitation(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_accept_partner_invitation(text) TO authenticated;

-- Return only this identity's active business/partner choices. No ERP role is granted.
CREATE FUNCTION public.erp_partner_portal_accounts() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'business',r.name) ORDER BY r.name,p.name),'[]'::jsonb)
 FROM public.business_partners p JOIN public.restaurants r ON r.id=p.restaurant_id
 WHERE auth.uid() IS NOT NULL AND p.user_id=auth.uid() AND p.is_active AND coalesce(r.is_active,true);
$$;
REVOKE ALL ON FUNCTION public.erp_partner_portal_accounts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_partner_portal_accounts() TO authenticated;

-- Aggregate balances over the whole ledger; paginate detail separately, never sum a truncated page.
CREATE FUNCTION public.erp_partner_portal_statement(p_partner_id uuid,p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_partner public.business_partners; v_totals jsonb; v_rows jsonb; v_count bigint;
BEGIN
 SELECT p.* INTO v_partner FROM public.business_partners p JOIN public.restaurants r ON r.id=p.restaurant_id
 WHERE p.id=p_partner_id AND p.user_id=auth.uid() AND p.is_active AND coalesce(r.is_active,true);
 IF auth.uid() IS NULL OR NOT FOUND THEN RAISE EXCEPTION 'PARTNER_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF p_offset IS NULL OR p_offset<0 THEN RAISE EXCEPTION 'PARTNER_INVALID'; END IF;
 SELECT count(*) INTO v_count FROM public.sponsor_owner_transactions WHERE partner_id=p_partner_id;
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO v_totals FROM (
  SELECT currency,
  sum(CASE WHEN kind='sponsor_advance_to_owner' THEN amount WHEN kind='owner_repay_sponsor' THEN -amount ELSE 0 END) owner_owes,
  sum(CASE WHEN kind='owner_advance_to_sponsor' THEN amount WHEN kind='sponsor_repay_owner' THEN -amount ELSE 0 END) partner_owes
  FROM public.sponsor_owner_transactions WHERE partner_id=p_partner_id GROUP BY currency ORDER BY currency
 ) x;
 SELECT coalesce(jsonb_agg(x ORDER BY x.effective_date DESC,x.id DESC),'[]'::jsonb) INTO v_rows FROM (
  SELECT t.id,t.kind,t.amount,t.currency,t.effective_date,t.notes,t.external_reference,w.payment_method,c.confirmed_at
  FROM public.sponsor_owner_transactions t JOIN public.wallet_transactions w ON w.id=t.wallet_transaction_id
  LEFT JOIN public.partner_transaction_confirmations c ON c.transaction_id=t.id
  WHERE t.partner_id=p_partner_id ORDER BY t.effective_date DESC,t.id DESC LIMIT 50 OFFSET p_offset
 ) x;
 RETURN jsonb_build_object('balances',v_totals,'records',v_rows,'count',v_count);
END; $$;
REVOKE ALL ON FUNCTION public.erp_partner_portal_statement(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_partner_portal_statement(uuid,integer) TO authenticated;

CREATE FUNCTION public.erp_confirm_partner_transaction(p_transaction_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (
 SELECT 1 FROM public.sponsor_owner_transactions t JOIN public.business_partners p ON p.id=t.partner_id
 JOIN public.restaurants r ON r.id=p.restaurant_id
 WHERE t.id=p_transaction_id AND p.user_id=auth.uid() AND p.is_active AND coalesce(r.is_active,true))
 THEN RAISE EXCEPTION 'PARTNER_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.partner_transaction_confirmations(transaction_id,user_id) VALUES(p_transaction_id,auth.uid()) ON CONFLICT DO NOTHING;
END; $$;
REVOKE ALL ON FUNCTION public.erp_confirm_partner_transaction(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_confirm_partner_transaction(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.erp_post_partner_transaction(p_restaurant_id uuid, p_partner_id uuid, p_owner_account_id uuid, p_kind text, p_amount numeric, p_date date, p_request_id uuid, p_notes text DEFAULT NULL::text, p_external_reference text DEFAULT NULL::text, p_proof_url text DEFAULT NULL::text)
 RETURNS sponsor_owner_transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_existing public.sponsor_owner_transactions%ROWTYPE;
  v_record public.sponsor_owner_transactions%ROWTYPE;
  v_account public.treasury_accounts%ROWTYPE;
  v_wallet_id uuid;
  v_wallet text;
  v_direction text;
  v_method text;
  v_due numeric;
  v_balance numeric;
  v_movement numeric;
  v_is_out boolean;
BEGIN
  IF auth.uid() IS NULL OR p_restaurant_id IS NULL OR
     NOT public.treasury_account_is_owner(p_restaurant_id) THEN
    RAISE EXCEPTION 'ERP_SPONSOR_OWNER_OWNER_ONLY' USING ERRCODE='42501';
  END IF;
  IF p_partner_id IS NOT NULL THEN
    PERFORM 1 FROM public.business_partners WHERE id=p_partner_id AND restaurant_id=p_restaurant_id AND is_active FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PARTNER_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  END IF;
  IF p_request_id IS NULL OR p_owner_account_id IS NULL OR
     p_date IS NULL OR p_date > current_date + 1 OR
     p_kind NOT IN ('sponsor_advance_to_owner','owner_repay_sponsor',
                    'owner_advance_to_sponsor','sponsor_repay_owner') OR
     p_kind IS NULL OR p_amount IS NULL OR
     p_amount <= 0 OR p_amount > 999999999.99 OR p_amount <> round(p_amount,2) OR
     length(coalesce(p_notes,'')) > 1000 OR
     length(coalesce(p_external_reference,'')) > 120 OR
     length(coalesce(p_proof_url,'')) > 2048 THEN
    RAISE EXCEPTION 'ERP_SPONSOR_OWNER_INVALID' USING ERRCODE='22023';
  END IF;

  -- Serialize both types of personal liability for the same company. This
  -- prevents two concurrent repayments from spending the same principal.
  PERFORM pg_advisory_xact_lock(hashtextextended('sponsor_owner:'||p_restaurant_id::text,0));
  SELECT * INTO v_existing FROM public.sponsor_owner_transactions
  WHERE id=p_request_id;
  IF FOUND THEN
    IF v_existing.restaurant_id=p_restaurant_id AND
       v_existing.partner_id IS NOT DISTINCT FROM p_partner_id AND
       v_existing.owner_account_id=p_owner_account_id AND
       v_existing.kind=p_kind AND v_existing.amount=p_amount AND
       v_existing.effective_date=p_date AND
       coalesce(v_existing.notes,'')=coalesce(nullif(trim(p_notes),''),'') AND
       coalesce(v_existing.external_reference,'')=coalesce(nullif(trim(p_external_reference),''),'') AND
       coalesce(v_existing.proof_url,'')=coalesce(nullif(trim(p_proof_url),''),'') THEN
       RETURN v_existing; -- Repeated click / timeout: ZERO extra journal entries.
    END IF;
    RAISE EXCEPTION 'ERP_SPONSOR_OWNER_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
  END IF;

  -- A verified remittance of branch sales cannot simultaneously become a
  -- personal loan. Match the user's bank/reference number exactly in the same
  -- restaurant and fail closed instead of double-classifying the same money.
  IF nullif(trim(p_external_reference),'') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.settlement_records c
    WHERE c.restaurant_id=p_restaurant_id
      AND c.status='approved'
      AND c.reference_id=trim(p_external_reference)
      AND c.flow_type IN ('MANAGER_TO_SPONSOR','SPONSOR_TO_OWNER')
  ) THEN
    RAISE EXCEPTION 'ERP_SPONSOR_OWNER_DUPLICATE_CUSTODY_REF' USING ERRCODE='23505';
  END IF;

  SELECT * INTO v_account FROM public.treasury_accounts
  WHERE id=p_owner_account_id AND restaurant_id=p_restaurant_id
    AND branch_id IS NULL AND branch_key IS NULL AND is_active=true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERP_SPONSOR_OWNER_ACCOUNT_INVALID' USING ERRCODE='22023';
  END IF;

  v_is_out:=p_kind IN ('owner_repay_sponsor','owner_advance_to_sponsor');
  v_direction:=CASE WHEN v_is_out THEN 'out' ELSE 'in' END;
  v_wallet:=CASE WHEN v_account.legacy_wallet_key IN ('owner_cash','owner_network')
       THEN v_account.legacy_wallet_key
       WHEN v_account.legacy_wallet_key IS NOT NULL THEN NULL
       WHEN v_account.account_type IN ('bank','network_pos','digital_wallet','clearing')
         THEN 'owner_network'
       ELSE 'owner_cash' END;
  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'ERP_SPONSOR_OWNER_WALLET_INVALID' USING ERRCODE='22023';
  END IF;
  v_method:=CASE WHEN v_wallet='owner_cash' THEN 'cash' ELSE 'network' END;

  IF p_kind IN ('owner_repay_sponsor','sponsor_repay_owner') THEN
    SELECT COALESCE(SUM(CASE
      WHEN kind=CASE WHEN p_kind='owner_repay_sponsor'
        THEN 'sponsor_advance_to_owner' ELSE 'owner_advance_to_sponsor' END
        THEN amount ELSE -amount END),0)
      INTO v_due
      FROM public.sponsor_owner_transactions
      WHERE restaurant_id=p_restaurant_id AND partner_id IS NOT DISTINCT FROM p_partner_id AND currency=v_account.currency
        AND kind IN (
          CASE WHEN p_kind='owner_repay_sponsor' THEN 'sponsor_advance_to_owner' ELSE 'owner_advance_to_sponsor' END,
          p_kind
        );
    IF v_due < p_amount THEN
      RAISE EXCEPTION 'ERP_SPONSOR_OWNER_REPAY_EXCEEDS_DUE' USING ERRCODE='22023';
    END IF;
  END IF;

  IF v_is_out THEN
    SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount
         WHEN direction='out' THEN -amount ELSE 0 END),0)
      INTO v_movement FROM public.wallet_transactions
      WHERE restaurant_id=p_restaurant_id AND account_id=v_account.id;
    v_balance:=coalesce(v_account.opening_balance,0)+v_movement;
    IF v_balance < p_amount THEN
      RAISE EXCEPTION 'ERP_SPONSOR_OWNER_INSUFFICIENT_TREASURY' USING ERRCODE='22023';
    END IF;
  END IF;

  INSERT INTO public.wallet_transactions (
    restaurant_id,branch_id,branch,transaction_date,
    transaction_type,direction,wallet,amount,payment_method,
    account_id,description,reference_id,auto_generated,
    recorded_by,created_by
  ) VALUES (
    p_restaurant_id,NULL,NULL,p_date,
    p_kind,v_direction,v_wallet,p_amount,v_method,
    p_owner_account_id,'Sponsor/Owner bilateral '||p_kind||': '||coalesce(left(p_notes,140),''),
    'sponsor_owner:'||p_request_id::text,true,
    auth.jwt()->>'email',auth.jwt()->>'email'
  ) RETURNING id INTO v_wallet_id;

  INSERT INTO public.sponsor_owner_transactions(
    id,restaurant_id,partner_id,owner_account_id,wallet_transaction_id,
    kind,amount,currency,effective_date,external_reference,
    notes,proof_url,posted_by
  ) VALUES (
    p_request_id,p_restaurant_id,p_partner_id,p_owner_account_id,v_wallet_id,
    p_kind,p_amount,v_account.currency,p_date,nullif(trim(p_external_reference),''),
    nullif(trim(p_notes),''),nullif(trim(p_proof_url),''),auth.uid()
  ) RETURNING * INTO v_record;
  RETURN v_record;
END;
$function$
;
REVOKE ALL ON FUNCTION public.erp_post_partner_transaction(uuid,uuid,uuid,text,numeric,date,uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_post_partner_transaction(uuid,uuid,uuid,text,numeric,date,uuid,text,text,text) TO authenticated;
-- Old clients can only post against legacy unassigned principal, never a partner's debt.
CREATE OR REPLACE FUNCTION public.erp_post_sponsor_owner_transaction(
 p_restaurant_id uuid,p_owner_account_id uuid,p_kind text,p_amount numeric,p_date date,p_request_id uuid,
 p_notes text DEFAULT NULL,p_external_reference text DEFAULT NULL,p_proof_url text DEFAULT NULL)
RETURNS public.sponsor_owner_transactions LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT public.erp_post_partner_transaction(p_restaurant_id,NULL,p_owner_account_id,p_kind,p_amount,p_date,p_request_id,p_notes,p_external_reference,p_proof_url);
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  requested_role text;
  requested_business_mode text;
  requested_restaurant uuid;
  requested_branch uuid;
  created_restaurant uuid;
  created_branch uuid;
  member_name text;
  member_phone text;
  company_name text;
  branch_name text;
  invitation_token text;
  invitation_hash text;
  invitation public.erp_invitations;
  v_partner public.business_partners;
BEGIN
  IF coalesce(NEW.raw_app_meta_data ->> 'platform_owner_clean_provisioning', 'false') = 'true'
     OR EXISTS (
       SELECT 1
       FROM public.platform_owner_clean_auth_rebind_jobs j
       WHERE j.status IN ('pending', 'provisioning')
         AND j.invocation_nonce_hash = encode(extensions.digest(coalesce(NEW.raw_user_meta_data ->> 'platform_owner_clean_provisioning_nonce', ''), 'sha256'), 'hex')
     ) THEN
    RETURN NEW;
  END IF;

  IF nullif(NEW.raw_user_meta_data->>'partner_invitation_token','') IS NOT NULL THEN
    SELECT p.* INTO v_partner FROM public.business_partners p
    JOIN public.partner_portal_invitations i ON i.partner_id=p.id
    WHERE i.token_hash=encode(extensions.digest(NEW.raw_user_meta_data->>'partner_invitation_token','sha256'),'hex')
      AND i.expires_at>now() AND i.accepted_at IS NULL AND p.is_active AND p.user_id IS NULL;
    IF NOT FOUND OR lower(NEW.email) IS DISTINCT FROM v_partner.email THEN
      RAISE EXCEPTION 'PARTNER_INVITATION_INVALID';
    END IF;
    -- This is an AFTER INSERT trigger: persist removal explicitly.
    UPDATE auth.users SET raw_user_meta_data=coalesce(NEW.raw_user_meta_data,'{}'::jsonb)
      - 'partner_invitation_token' - 'role' - 'restaurant_id' - 'branch_id' WHERE id=NEW.id;
    RETURN NEW;
  END IF;

  invitation_token := NULLIF(btrim(coalesce(NEW.raw_user_meta_data->>'invitation_token', '')), '');
  requested_role := lower(coalesce(NEW.raw_user_meta_data->>'role', ''));

  -- A non-owner account is never provisioned here. The authenticated activation
  -- RPC creates its profile, membership, and branch assignment only after identity
  -- confirmation. The token is stripped from auth metadata and never persisted.
  IF invitation_token IS NOT NULL THEN
    invitation_hash := encode(extensions.digest(invitation_token, 'sha256'), 'hex');
    SELECT * INTO invitation
    FROM public.erp_invitations
    WHERE token_hash = invitation_hash
      AND status = 'pending'
      AND expires_at > now()
    LIMIT 1;

    IF invitation.id IS NULL THEN
      RAISE EXCEPTION 'A current, valid owner invitation is required to create this account';
    END IF;
    IF invitation.email IS NOT NULL
       AND lower(coalesce(NEW.email, '')) <> lower(invitation.email) THEN
      RAISE EXCEPTION 'Use the email address assigned by the owner invitation';
    END IF;
    IF invitation.phone IS NOT NULL
       AND regexp_replace(coalesce(NEW.phone, ''), '[^0-9]', '', 'g') <> invitation.phone THEN
      RAISE EXCEPTION 'Use the phone number assigned by the owner invitation';
    END IF;

    NEW.raw_user_meta_data :=
      (coalesce(NEW.raw_user_meta_data, '{}'::jsonb)
        - 'invitation_token' - 'role' - 'restaurant_id' - 'branch_id')
      || jsonb_build_object('invitation_pending', true);
    RETURN NEW;
  END IF;

  IF requested_role <> 'owner' THEN
    RAISE EXCEPTION 'Non-owner accounts are invitation-only. Ask an organization owner to send an invitation.';
  END IF;

  requested_business_mode := lower(btrim(coalesce(nullif(NEW.raw_user_meta_data->>'business_type', ''), 'restaurant')));
  IF requested_business_mode NOT IN (
    'restaurant', 'cafe', 'retail', 'warehouse', 'factory',
    'pharmacy', 'clinic', 'wholesale', 'services', 'other'
  ) THEN
    RAISE EXCEPTION 'Owner setup requires a valid ERP portal';
  END IF;

  member_name := btrim(coalesce(NEW.raw_user_meta_data->>'full_name', ''));
  member_phone := NULLIF(btrim(coalesce(NEW.raw_user_meta_data->>'phone', '')), '');
  company_name := btrim(coalesce(NEW.raw_user_meta_data->>'company_name', member_name || ' Company'));
  branch_name := btrim(coalesce(NEW.raw_user_meta_data->>'branch_name', 'Main Branch'));

  IF member_name = '' OR company_name = '' OR branch_name = '' THEN
    RAISE EXCEPTION 'Owner setup requires a name, organization name, and initial branch';
  END IF;

  INSERT INTO public.restaurants (
    org_id, name, created_by, business_mode, business_type, tenant_id, branches, address, currency
  ) VALUES (
    NEW.email, company_name, NEW.email,
    requested_business_mode::public.business_mode_type,
    requested_business_mode,
    NEW.id::text, '[]'::jsonb,
    NULLIF(btrim(coalesce(NEW.raw_user_meta_data->>'address', '')), ''),
    coalesce(nullif(NEW.raw_user_meta_data->>'currency_symbol', ''), '$')
  ) RETURNING id INTO created_restaurant;

  INSERT INTO public.org_settings (organization_id, settings, created_at, updated_at)
  VALUES (
    created_restaurant,
    jsonb_build_object(
      'workspace_customization',
      public.erp_registration_workspace_for_portal(requested_business_mode)
    ),
    now(),
    now()
  )
  ON CONFLICT (organization_id) DO UPDATE
  SET settings = coalesce(public.org_settings.settings, '{}'::jsonb)
      || jsonb_build_object(
        'workspace_customization',
        public.erp_registration_workspace_for_portal(requested_business_mode)
      ),
      updated_at = now();

  INSERT INTO public.branches (
    restaurant_id, branch_key, name, location, is_active, created_by, tenant_id
  ) VALUES (
    created_restaurant,
    'main-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
    branch_name,
    NULLIF(btrim(coalesce(NEW.raw_user_meta_data->>'branch_location', '')), ''),
    true, NEW.email, NEW.id::text
  ) RETURNING id INTO created_branch;

  UPDATE public.restaurants
  SET branch_id = created_branch,
      restaurant_id = created_restaurant,
      branches = jsonb_build_array(jsonb_build_object(
        'id', created_branch,
        'key', (SELECT branch_key FROM public.branches WHERE id = created_branch),
        'branch_key', (SELECT branch_key FROM public.branches WHERE id = created_branch),
        'label', branch_name,
        'name', branch_name,
        'is_active', true
      ))
  WHERE id = created_restaurant;

  requested_restaurant := created_restaurant;
  requested_branch := created_branch;

  INSERT INTO public.profiles (
    id, email, full_name, role, phone, approval_status, restaurant_id, organization_id,
    branch_id, branch, tenant_id, permissions, is_active, approved_at, created_by
  ) VALUES (
    NEW.id, NEW.email, member_name, 'owner', member_phone, 'approved',
    requested_restaurant, requested_restaurant, requested_branch,
    (SELECT branch_key FROM public.branches WHERE id = requested_branch),
    requested_restaurant::text, public.erp_default_permissions('owner'), true, now(), NEW.email
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    phone = EXCLUDED.phone,
    approval_status = EXCLUDED.approval_status,
    restaurant_id = EXCLUDED.restaurant_id,
    organization_id = EXCLUDED.organization_id,
    branch_id = EXCLUDED.branch_id,
    branch = EXCLUDED.branch,
    tenant_id = EXCLUDED.tenant_id,
    permissions = EXCLUDED.permissions,
    is_active = true,
    approved_at = EXCLUDED.approved_at,
    updated_date = now();

  INSERT INTO public.erp_memberships (
    user_id, email, full_name, phone, role, status, restaurant_id, branch_id,
    permissions, registration_data, approved_at
  ) VALUES (
    NEW.id, NEW.email, member_name, member_phone, 'owner', 'approved',
    requested_restaurant, requested_branch, public.erp_default_permissions('owner'),
    coalesce(NEW.raw_user_meta_data, '{}'::jsonb), now()
  ) ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.branch_assignments (
    user_id, restaurant_id, organization_id, branch_id, role, is_primary, active
  ) VALUES (
    NEW.id, requested_restaurant, requested_restaurant, requested_branch, 'owner', true, true
  ) ON CONFLICT (user_id, branch_id) DO UPDATE
    SET restaurant_id = EXCLUDED.restaurant_id,
        organization_id = EXCLUDED.organization_id,
        role = EXCLUDED.role,
        is_primary = true,
        active = true,
        updated_at = now();

  RETURN NEW;
END;
$function$
;
