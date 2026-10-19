-- Wallet Banking Center v1: new internal, treasury-backed, owner-approved
-- wallet ledger. DOES NOT remove historical sponsor/custody/loan data.
-- DO NOT present this as an IBAN, bank transfer, e-money, or deposit account.
CREATE TABLE IF NOT EXISTS public.erp_bank_wallet_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
 person_id uuid NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','frozen','closed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(restaurant_id,person_id,currency),
 UNIQUE(id,restaurant_id,currency),
 FOREIGN KEY (restaurant_id,person_id) REFERENCES public.business_partners(restaurant_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS public.erp_bank_wallet_requests (
 id uuid PRIMARY KEY,
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
 person_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('fund_wallet','return_to_owner')),
 amount numeric(18,2) NOT NULL CHECK(amount>0 AND amount<=10000000),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','posted','rejected')),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=500),
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 reviewed_at timestamptz,
 review_note text CHECK(review_note IS NULL OR length(review_note)<=500),
 owner_treasury_account_id uuid REFERENCES public.treasury_accounts(id) ON DELETE RESTRICT,
 treasury_transaction_id uuid UNIQUE REFERENCES public.wallet_transactions(id) ON DELETE RESTRICT,
 FOREIGN KEY (restaurant_id,person_id) REFERENCES public.business_partners(restaurant_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS public.erp_bank_wallet_postings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES public.erp_bank_wallet_requests(id) ON DELETE RESTRICT,
 restaurant_id uuid NOT NULL,
 wallet_account_id uuid NOT NULL,
 currency text NOT NULL,
 side text NOT NULL CHECK(side IN('person','owner_clearing')),
 signed_amount numeric(18,2) NOT NULL CHECK(signed_amount<>0),
 posted_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(request_id,side),
 FOREIGN KEY (wallet_account_id,restaurant_id,currency)
   REFERENCES public.erp_bank_wallet_accounts(id,restaurant_id,currency) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS erp_bank_wallet_requests_person_time_idx
 ON public.erp_bank_wallet_requests(restaurant_id,person_id,created_at DESC);
CREATE INDEX IF NOT EXISTS erp_bank_wallet_postings_account_idx
 ON public.erp_bank_wallet_postings(wallet_account_id,currency,side);
CREATE UNIQUE INDEX IF NOT EXISTS erp_wallet_treasury_event_once
 ON public.wallet_transactions(reference_id)
 WHERE reference_id LIKE 'bank_wallet:%';
ALTER TABLE public.erp_bank_wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_bank_wallet_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_bank_wallet_postings ENABLE ROW LEVEL SECURITY;

-- Authenticated clients ONLY read through narrowly scoped SECURITY DEFINER RPCs.
REVOKE ALL ON public.erp_bank_wallet_accounts,
 public.erp_bank_wallet_requests, public.erp_bank_wallet_postings FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.erp_bank_wallet_no_history_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 RAISE EXCEPTION 'WALLET_POSTED_IMMUTABLE' USING ERRCODE='55000';
END;$$;
DROP TRIGGER IF EXISTS erp_bank_wallet_postings_immutable ON public.erp_bank_wallet_postings;
CREATE TRIGGER erp_bank_wallet_postings_immutable BEFORE UPDATE OR DELETE
 ON public.erp_bank_wallet_postings FOR EACH ROW
 EXECUTE FUNCTION public.erp_bank_wallet_no_history_mutation();
CREATE OR REPLACE FUNCTION public.erp_bank_wallet_treasury_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.reference_id LIKE 'bank_wallet:%' THEN
  RAISE EXCEPTION 'WALLET_TREASURY_IMMUTABLE' USING ERRCODE='55000';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;$$;
DROP TRIGGER IF EXISTS erp_bank_wallet_treasury_immutable ON public.wallet_transactions;
CREATE TRIGGER erp_bank_wallet_treasury_immutable BEFORE UPDATE OR DELETE
 ON public.wallet_transactions FOR EACH ROW
 EXECUTE FUNCTION public.erp_bank_wallet_treasury_immutable();

-- One API for BOTH customer-owned and owner-permitted account statements.
-- No loan or custody history is converted to spendable balance.
CREATE OR REPLACE FUNCTION public.erp_bank_wallet_dashboard(
 p_person uuid, p_limit integer DEFAULT 30
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE
 p public.business_partners;
 v_business text;
 v_owner boolean;
 v_wallet jsonb;
 v_history jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_person IS NULL OR p_limit NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'WALLET_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM public.business_partners WHERE id=p_person;
 IF NOT FOUND OR NOT p.is_active OR NOT EXISTS(
  SELECT 1 FROM public.restaurants WHERE id=p.restaurant_id AND coalesce(is_active,true)
 ) THEN RAISE EXCEPTION 'WALLET_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 v_owner:=coalesce(public.treasury_account_is_owner(p.restaurant_id),false);
 IF NOT v_owner AND p.user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'WALLET_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT name INTO v_business FROM public.restaurants WHERE id=p.restaurant_id;
 SELECT coalesce(jsonb_agg(x ORDER BY x.currency),'[]'::jsonb) INTO v_wallet
 FROM (
  SELECT a.id,a.currency,a.status,
   coalesce(sum(j.signed_amount) FILTER(WHERE j.side='person'),0) balance,
   (SELECT coalesce(sum(r.amount),0) FROM public.erp_bank_wallet_requests r
    WHERE r.person_id=p.id AND r.currency=a.currency AND r.status='pending') pending_amount,
   coalesce(sum(j.signed_amount) FILTER(WHERE j.side='person' AND j.signed_amount>0),0) transfers_in,
   -coalesce(sum(j.signed_amount) FILTER(WHERE j.side='person' AND j.signed_amount<0),0) transfers_out
  FROM public.erp_bank_wallet_accounts a
  LEFT JOIN public.erp_bank_wallet_postings j ON j.wallet_account_id=a.id
  WHERE a.restaurant_id=p.restaurant_id AND a.person_id=p.id
  GROUP BY a.id,a.currency,a.status
 )x;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb)
 INTO v_history FROM (
  SELECT r.id,r.kind,r.amount,r.currency,r.status,r.note,r.created_at,
   r.reviewed_at,r.review_note,r.treasury_transaction_id,
   (CASE WHEN r.kind='fund_wallet' THEN v_business ELSE 'WLT-'||upper(replace(p.id::text,'-','')) END) payer,
   (CASE WHEN r.kind='fund_wallet' THEN 'WLT-'||upper(replace(p.id::text,'-','')) ELSE v_business END) payee,
   (CASE WHEN r.status='posted' AND r.kind='fund_wallet' THEN r.amount
         WHEN r.status='posted' THEN -r.amount ELSE 0 END) wallet_delta
  FROM public.erp_bank_wallet_requests r
  WHERE r.restaurant_id=p.restaurant_id AND r.person_id=p.id
  ORDER BY r.created_at DESC,r.id DESC LIMIT p_limit
 )x;
 RETURN jsonb_build_object('person_id',p.id,
  'account_reference','WLT-'||upper(replace(p.id::text,'-','')),
  'person_name',p.name,'business_name',v_business,
  'restaurant_id',p.restaurant_id,'is_owner',v_owner,
  'currencies',coalesce(v_wallet,'[]'::jsonb),
  'transactions',coalesce(v_history,'[]'::jsonb),
  'legacy_migration','historical_loans_and_custody_archived_not_spendable',
  'generated_at',clock_timestamp());
END;$$;

-- User submits; no money moves until owner approval.
CREATE OR REPLACE FUNCTION public.erp_bank_wallet_request(
 p_person uuid,p_kind text,p_amount numeric,p_currency text,
 p_request_id uuid,p_note text DEFAULT ''
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE p public.business_partners;r public.erp_bank_wallet_requests;
BEGIN
 IF auth.uid() IS NULL OR p_person IS NULL OR p_request_id IS NULL OR
 p_kind NOT IN('fund_wallet','return_to_owner') OR p_amount IS NULL OR
 p_amount<=0 OR p_amount>10000000 OR p_amount<>round(p_amount,2) OR
 p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' OR
 length(coalesce(p_note,''))>500
 THEN RAISE EXCEPTION 'WALLET_REQUEST_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM public.business_partners WHERE id=p_person FOR SHARE;
 IF NOT FOUND OR p.user_id IS DISTINCT FROM auth.uid() OR NOT p.is_active OR
 NOT p.can_submit OR NOT EXISTS(SELECT 1 FROM public.restaurants
  WHERE id=p.restaurant_id AND coalesce(is_active,true)) THEN
  RAISE EXCEPTION 'WALLET_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 -- Replay is always idempotent for precisely the original author and payload.
 SELECT * INTO r FROM public.erp_bank_wallet_requests WHERE id=p_request_id;
 IF FOUND THEN
  IF r.person_id=p_person AND r.kind=p_kind AND r.amount=p_amount
   AND r.currency=p_currency AND r.created_by=auth.uid()
   AND r.note=coalesce(p_note,'')
  THEN RETURN r.id;END IF;
  RAISE EXCEPTION 'WALLET_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
 END IF;
 INSERT INTO public.erp_bank_wallet_requests(
  id,restaurant_id,person_id,kind,amount,currency,note,created_by)
 VALUES(p_request_id,p.restaurant_id,p.id,p_kind,p_amount,p_currency,
  coalesce(p_note,''),auth.uid());
 RETURN p_request_id;
END;$$;

-- Owner reviews against a real, same-currency owner Treasury account.
-- All writes (Treasury, two balanced lines, status) commit atomically.
CREATE OR REPLACE FUNCTION public.erp_bank_wallet_review(
 p_request_id uuid,p_approve boolean,p_treasury_account uuid DEFAULT NULL,
 p_review_note text DEFAULT ''
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE
 r public.erp_bank_wallet_requests;
 p public.business_partners;
 a public.treasury_accounts;
 v_account uuid;
 v_balance numeric;
 v_treasury_available numeric;
 v_treasury_tx uuid;
 v_method text;
 v_funding boolean;
BEGIN
 IF auth.uid() IS NULL OR p_approve IS NULL OR p_request_id IS NULL OR
 length(coalesce(p_review_note,''))>500 OR
 (p_approve AND length(trim(coalesce(p_review_note,'')))<8) OR
 (NOT p_approve AND length(trim(coalesce(p_review_note,'')))<8)
 THEN RAISE EXCEPTION 'WALLET_REVIEW_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM public.erp_bank_wallet_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_REQUEST_NOT_FOUND' USING ERRCODE='22023';END IF;
 IF NOT coalesce(public.treasury_account_is_owner(r.restaurant_id),false) OR
  r.created_by=auth.uid() THEN
  RAISE EXCEPTION 'WALLET_OWNER_APPROVAL_REQUIRED' USING ERRCODE='42501';END IF;
 IF r.status<>'pending' THEN
  IF (p_approve AND r.status='posted') OR
     (NOT p_approve AND r.status='rejected') THEN RETURN r.id;END IF;
  RAISE EXCEPTION 'WALLET_REQUEST_ALREADY_CLOSED' USING ERRCODE='22023';
 END IF;
 IF NOT p_approve THEN
  UPDATE public.erp_bank_wallet_requests SET status='rejected',
   reviewed_by=auth.uid(),reviewed_at=now(),review_note=trim(p_review_note)
   WHERE id=r.id;
  RETURN r.id;
 END IF;
 SELECT * INTO p FROM public.business_partners WHERE id=r.person_id FOR SHARE;
 IF NOT FOUND OR NOT p.is_active OR p.restaurant_id<>r.restaurant_id OR
  NOT EXISTS(SELECT 1 FROM public.restaurants
   WHERE id=r.restaurant_id AND coalesce(is_active,true)) THEN
  RAISE EXCEPTION 'WALLET_ACCOUNT_INACTIVE' USING ERRCODE='42501';
 END IF;
 -- Serialize balance checks and posts across all requests for same subaccount.
 PERFORM pg_advisory_xact_lock(hashtextextended('bank-wallet:'||p.id||':'||r.currency,0));
 INSERT INTO public.erp_bank_wallet_accounts(restaurant_id,person_id,currency)
 VALUES(r.restaurant_id,r.person_id,r.currency)
 ON CONFLICT(restaurant_id,person_id,currency) DO NOTHING;
 SELECT id INTO v_account FROM public.erp_bank_wallet_accounts
 WHERE restaurant_id=r.restaurant_id AND person_id=r.person_id
  AND currency=r.currency AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_ACCOUNT_FROZEN' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM public.treasury_accounts
 WHERE id=p_treasury_account AND restaurant_id=r.restaurant_id
  AND currency=r.currency AND is_active
  AND branch_id IS NULL AND branch_key IS NULL
  AND (legacy_wallet_key IS NULL OR legacy_wallet_key IN('owner_cash','owner_network'))
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_TREASURY_ACCOUNT_INVALID' USING ERRCODE='42501';END IF;
 v_funding:=(r.kind='fund_wallet');
 v_method:=CASE WHEN a.legacy_wallet_key='owner_cash' OR a.account_type IN('cash','petty_cash')
  THEN 'cash' ELSE 'network' END;
 IF v_funding THEN
  SELECT a.opening_balance+coalesce(sum(CASE WHEN t.direction='in' THEN t.amount
    WHEN t.direction='out' THEN -t.amount ELSE 0 END),0)
   INTO v_treasury_available FROM public.wallet_transactions t
   WHERE t.account_id=a.id AND t.restaurant_id=r.restaurant_id;
  IF coalesce(v_treasury_available,0)<r.amount THEN
   RAISE EXCEPTION 'WALLET_TREASURY_INSUFFICIENT_FUNDS' USING ERRCODE='22003';END IF;
 ELSE
  SELECT coalesce(sum(signed_amount),0) INTO v_balance
   FROM public.erp_bank_wallet_postings
   WHERE wallet_account_id=v_account AND side='person' AND currency=r.currency;
  IF v_balance<r.amount THEN
   RAISE EXCEPTION 'WALLET_INSUFFICIENT_FUNDS' USING ERRCODE='22003';END IF;
 END IF;
 INSERT INTO public.wallet_transactions(
  currency,restaurant_id,transaction_date,transaction_type,direction,wallet,
  amount,payment_method,account_id,description,reference_id,auto_generated,recorded_by,created_by)
 VALUES(r.currency,r.restaurant_id,current_date,'transfer',
  CASE WHEN v_funding THEN 'out' ELSE 'in' END,
  CASE WHEN v_method='cash' THEN 'owner_cash' ELSE 'owner_network' END,
  r.amount,v_method,a.id,'Internal bank-style wallet: '||p.name,
  'bank_wallet:'||r.id::text,true,auth.jwt()->>'email',auth.jwt()->>'email')
 RETURNING id INTO v_treasury_tx;
 INSERT INTO public.erp_bank_wallet_postings(request_id,restaurant_id,
  wallet_account_id,currency,side,signed_amount)
 VALUES
 (r.id,r.restaurant_id,v_account,r.currency,'person',
   CASE WHEN v_funding THEN r.amount ELSE -r.amount END),
 (r.id,r.restaurant_id,v_account,r.currency,'owner_clearing',
   CASE WHEN v_funding THEN -r.amount ELSE r.amount END);
 UPDATE public.erp_bank_wallet_requests SET status='posted',
  reviewed_by=auth.uid(),reviewed_at=now(),review_note=trim(p_review_note),
  owner_treasury_account_id=a.id,treasury_transaction_id=v_treasury_tx
 WHERE id=r.id;
 RETURN r.id;
END;$$;
REVOKE ALL ON FUNCTION public.erp_bank_wallet_dashboard(uuid,integer),
 public.erp_bank_wallet_request(uuid,text,numeric,text,uuid,text),
 public.erp_bank_wallet_review(uuid,boolean,uuid,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_bank_wallet_dashboard(uuid,integer),
 public.erp_bank_wallet_request(uuid,text,numeric,text,uuid,text),
 public.erp_bank_wallet_review(uuid,boolean,uuid,text)
 TO authenticated;
COMMENT ON TABLE public.erp_bank_wallet_accounts IS
 'INTERNAL ERP wallet units; not customer bank accounts or regulated deposits. Legacy loan/custody history remains outside this ledger.';
