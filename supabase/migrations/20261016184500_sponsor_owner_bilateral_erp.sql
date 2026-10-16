-- Sponsor↔Owner personal/third-party advances and repayments.
-- This is NOT the branch Sponsor custodian settlement ledger, income, P&L
-- or an automatic bank reconciliation. Only real, owner-confirmed transfers
-- are posted and each has exactly one linked Owner Treasury wallet movement.
CREATE TABLE IF NOT EXISTS public.sponsor_owner_transactions (
  id uuid PRIMARY KEY,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  owner_account_id uuid NOT NULL REFERENCES public.treasury_accounts(id) ON DELETE RESTRICT,
  wallet_transaction_id uuid NOT NULL UNIQUE REFERENCES public.wallet_transactions(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN (
    'sponsor_advance_to_owner','owner_repay_sponsor',
    'owner_advance_to_sponsor','sponsor_repay_owner')),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency varchar(8) NOT NULL CHECK (length(trim(currency)) > 0),
  effective_date date NOT NULL,
  external_reference text,
  notes text,
  proof_url text,
  posted_by uuid NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sponsor_owner_reference_length CHECK (length(coalesce(external_reference,'')) <= 120),
  CONSTRAINT sponsor_owner_notes_length CHECK (length(coalesce(notes,'')) <= 1000),
  CONSTRAINT sponsor_owner_proof_length CHECK (length(coalesce(proof_url,'')) <= 2048),
  CONSTRAINT sponsor_owner_unique_tenant_id UNIQUE (restaurant_id,id)
);
CREATE INDEX IF NOT EXISTS sponsor_owner_tenant_currency_date_idx
  ON public.sponsor_owner_transactions(restaurant_id,currency,effective_date DESC,id DESC);

ALTER TABLE public.sponsor_owner_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sponsor_owner_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sponsor_owner_transactions TO authenticated;

DROP POLICY IF EXISTS sponsor_owner_owner_select ON public.sponsor_owner_transactions;
CREATE POLICY sponsor_owner_owner_select ON public.sponsor_owner_transactions
  FOR SELECT TO authenticated USING (public.treasury_account_is_owner(restaurant_id));

-- The owner must not modify a posted loan or its linked Treasury transaction.
-- A correction needs a separately designed, audited reversal, not an UPDATE.
CREATE OR REPLACE FUNCTION public.erp_guard_sponsor_owner_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO public,pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'ERP_SPONSOR_OWNER_POSTED_IMMUTABLE' USING ERRCODE='P0001';
END;
$$;
DROP TRIGGER IF EXISTS trg_erp_sponsor_owner_immutable ON public.sponsor_owner_transactions;
CREATE TRIGGER trg_erp_sponsor_owner_immutable
  BEFORE UPDATE OR DELETE ON public.sponsor_owner_transactions
  FOR EACH ROW EXECUTE FUNCTION public.erp_guard_sponsor_owner_immutable();

CREATE OR REPLACE FUNCTION public.erp_guard_sponsor_owner_wallet_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO public,pg_temp AS $$
BEGIN
 IF OLD.reference_id LIKE 'sponsor_owner:%' AND
   OLD.transaction_type IN ('sponsor_advance_to_owner','owner_repay_sponsor',
                             'owner_advance_to_sponsor','sponsor_repay_owner')
 THEN RAISE EXCEPTION 'ERP_SPONSOR_OWNER_POSTED_IMMUTABLE' USING ERRCODE='P0001';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_erp_sponsor_owner_wallet_immutable ON public.wallet_transactions;
CREATE TRIGGER trg_erp_sponsor_owner_wallet_immutable
  BEFORE UPDATE OR DELETE ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.erp_guard_sponsor_owner_wallet_immutable();

CREATE UNIQUE INDEX IF NOT EXISTS wallet_sponsor_owner_reference_uniq
  ON public.wallet_transactions(restaurant_id,reference_id)
  WHERE reference_id LIKE 'sponsor_owner:%';

-- A SECURITY DEFINER call is required because direct insertion is disabled:
-- one atomic server transaction posts an immutable sponsor/owner document
-- and its EXACTLY ONE linked owner account cash movement.
CREATE OR REPLACE FUNCTION public.erp_post_sponsor_owner_transaction(
  p_restaurant_id uuid,
  p_owner_account_id uuid,
  p_kind text,
  p_amount numeric,
  p_date date,
  p_request_id uuid,
  p_notes text DEFAULT NULL,
  p_external_reference text DEFAULT NULL,
  p_proof_url text DEFAULT NULL
)
RETURNS public.sponsor_owner_transactions
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public,pg_temp
AS $$
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
  IF p_request_id IS NULL OR p_owner_account_id IS NULL OR
     p_date IS NULL OR p_date > current_date OR
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
      WHERE restaurant_id=p_restaurant_id AND currency=v_account.currency
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
    id,restaurant_id,owner_account_id,wallet_transaction_id,
    kind,amount,currency,effective_date,external_reference,
    notes,proof_url,posted_by
  ) VALUES (
    p_request_id,p_restaurant_id,p_owner_account_id,v_wallet_id,
    p_kind,p_amount,v_account.currency,p_date,nullif(trim(p_external_reference),''),
    nullif(trim(p_notes),''),nullif(trim(p_proof_url),''),auth.uid()
  ) RETURNING * INTO v_record;
  RETURN v_record;
END;
$$;

REVOKE ALL ON FUNCTION public.erp_post_sponsor_owner_transaction(
  uuid,uuid,text,numeric,date,uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_post_sponsor_owner_transaction(
  uuid,uuid,text,numeric,date,uuid,text,text,text) TO authenticated;

COMMENT ON TABLE public.sponsor_owner_transactions IS
'Posted owner/sponsor bilateral advances and principal repayments, separate from branch sponsor custodial settlements and restaurant P&L. No legacy rows backfilled.';
