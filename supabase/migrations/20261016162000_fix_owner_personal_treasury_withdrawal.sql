-- Align personal-finance form with the canonical table and post withdrawals
-- atomically to the owner Treasury ledger. No historical monetary rows are rewritten.
ALTER TABLE public.owner_personal_finance
  ADD COLUMN IF NOT EXISTS record_type text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS wallet_source text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS proof_url text,
  ADD COLUMN IF NOT EXISTS recorded_by text;

-- Backwards compatibility for the existing "type" column.
UPDATE public.owner_personal_finance
SET record_type = type
WHERE record_type IS NULL AND type IN ('expense', 'income', 'withdrawal');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='owner_personal_finance_record_type_chk'
                 AND conrelid='public.owner_personal_finance'::regclass) THEN
    ALTER TABLE public.owner_personal_finance
      ADD CONSTRAINT owner_personal_finance_record_type_chk
      CHECK (record_type IN ('expense','income','withdrawal'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='owner_personal_finance_positive_amount_chk'
                 AND conrelid='public.owner_personal_finance'::regclass) THEN
    ALTER TABLE public.owner_personal_finance
      ADD CONSTRAINT owner_personal_finance_positive_amount_chk CHECK (amount > 0);
  END IF;
END $$;

-- Retried inserts use the same personal-finance UUID. This extra reference
-- constraint prevents a ledger debit for that entry from ever being doubled.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_personal_finance_reference_uniq
  ON public.wallet_transactions(restaurant_id, reference_id)
  WHERE transaction_type='owner_personal_withdrawal'
    AND reference_id LIKE 'owner_personal_finance:%';

CREATE OR REPLACE FUNCTION public.erp_post_personal_finance_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account_id uuid;
  v_opening numeric;
  v_movement numeric;
  v_balance numeric;
BEGIN
  IF NEW.restaurant_id IS NULL OR NEW.date IS NULL
      OR NEW.record_type NOT IN ('expense','income','withdrawal')
      OR NEW.record_type IS NULL OR NEW.amount IS NULL
      OR NEW.amount <= 0 OR NEW.amount > 999999999.99
      OR round(NEW.amount, 2) <> NEW.amount THEN
    RAISE EXCEPTION 'ERP_PERSONAL_FINANCE_INVALID_ENTRY' USING ERRCODE='22023';
  END IF;

  IF NEW.record_type <> 'withdrawal' THEN
    RETURN NEW;
  END IF;

  IF NEW.wallet_source NOT IN ('owner_cash','owner_network')
      OR NEW.wallet_source IS NULL THEN
    RAISE EXCEPTION 'ERP_PERSONAL_FINANCE_INVALID_WALLET' USING ERRCODE='22023';
  END IF;

  -- A system owner account must exist, be active and belong to this tenant.
  -- Locking serializes concurrent personal withdrawals through this form.
  SELECT a.id, a.opening_balance INTO v_account_id, v_opening
  FROM public.treasury_accounts a
  WHERE a.restaurant_id = NEW.restaurant_id
    AND a.branch_id IS NULL AND a.branch_key IS NULL
    AND a.legacy_wallet_key = NEW.wallet_source
    AND a.is_system IS TRUE AND a.is_active IS TRUE
  ORDER BY a.created_date, a.id
  LIMIT 1 FOR UPDATE;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'ERP_PERSONAL_FINANCE_WALLET_NOT_CONFIGURED'
      USING ERRCODE='P0001';
  END IF;

  SELECT COALESCE(SUM(CASE
      WHEN tx.direction='in' THEN tx.amount
      WHEN tx.direction='out' THEN -tx.amount
      ELSE 0 END), 0)
  INTO v_movement
  FROM public.wallet_transactions tx
  WHERE tx.restaurant_id=NEW.restaurant_id AND tx.account_id=v_account_id;

  v_balance := COALESCE(v_opening,0) + v_movement;
  IF v_balance < NEW.amount THEN
    RAISE EXCEPTION 'ERP_PERSONAL_FINANCE_INSUFFICIENT_BALANCE'
      USING ERRCODE='P0001';
  END IF;

  -- This transaction belongs to Treasury only (no branch expense/P&L).
  -- Existing wallet account-assignment and security triggers remain active.
  INSERT INTO public.wallet_transactions (
    transaction_date, transaction_type, direction, wallet,
    branch, branch_id, restaurant_id, amount, payment_method,
    description, reference_id, auto_generated, account_id,
    recorded_by, created_by
  ) VALUES (
    NEW.date, 'owner_personal_withdrawal', 'out', NEW.wallet_source,
    NULL, NULL, NEW.restaurant_id, NEW.amount, NEW.payment_method,
    COALESCE(NULLIF(NEW.notes,''),'Owner personal withdrawal'),
    'owner_personal_finance:' || NEW.id::text, TRUE, v_account_id,
    NEW.recorded_by, NEW.created_by
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_erp_post_owner_personal_finance ON public.owner_personal_finance;
CREATE TRIGGER trg_erp_post_owner_personal_finance
AFTER INSERT ON public.owner_personal_finance
FOR EACH ROW EXECUTE FUNCTION public.erp_post_personal_finance_withdrawal();

-- A posted withdrawal and its immutable wallet debit must not be edited
-- or removed without an explicit audited reversal workflow.
CREATE OR REPLACE FUNCTION public.erp_guard_personal_finance_posted_record()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.record_type='withdrawal' THEN
    RAISE EXCEPTION 'ERP_PERSONAL_FINANCE_POSTED_IMMUTABLE' USING ERRCODE='P0001';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_erp_guard_posted_owner_personal_finance ON public.owner_personal_finance;
CREATE TRIGGER trg_erp_guard_posted_owner_personal_finance
BEFORE UPDATE OR DELETE ON public.owner_personal_finance
FOR EACH ROW EXECUTE FUNCTION public.erp_guard_personal_finance_posted_record();

CREATE OR REPLACE FUNCTION public.erp_guard_linked_personal_finance_debit()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.transaction_type='owner_personal_withdrawal'
     AND OLD.reference_id LIKE 'owner_personal_finance:%' THEN
    RAISE EXCEPTION 'ERP_PERSONAL_FINANCE_POSTED_IMMUTABLE' USING ERRCODE='P0001';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_erp_guard_linked_personal_debit ON public.wallet_transactions;
CREATE TRIGGER trg_erp_guard_linked_personal_debit
BEFORE UPDATE OR DELETE ON public.wallet_transactions
FOR EACH ROW EXECUTE FUNCTION public.erp_guard_linked_personal_finance_debit();

COMMENT ON FUNCTION public.erp_post_personal_finance_withdrawal() IS
'Owner personal withdrawal posts an atomic, account-linked Treasury debit; no restaurant P&L posting.';
