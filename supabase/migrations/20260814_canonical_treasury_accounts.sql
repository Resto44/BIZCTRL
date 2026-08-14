-- Canonical Treasury account registry and wallet transaction linkage.
-- Keeps public.wallet_transactions as the one transaction ledger; no duplicate ledger is introduced.

CREATE TABLE IF NOT EXISTS public.treasury_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  branch_id uuid NULL REFERENCES public.branches(id) ON DELETE SET NULL,
  branch_key text NULL,
  account_name text NOT NULL CHECK (char_length(trim(account_name)) > 0),
  account_type text NOT NULL CHECK (account_type IN ('cash', 'bank', 'network_pos', 'digital_wallet', 'petty_cash', 'clearing', 'other')),
  currency text NOT NULL DEFAULT 'SAR' CHECK (char_length(trim(currency)) BETWEEN 1 AND 8),
  opening_balance numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text NULL,
  legacy_wallet_key text NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_by text NULL,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS treasury_accounts_system_wallet_scope_unique
  ON public.treasury_accounts (restaurant_id, COALESCE(branch_key, ''), legacy_wallet_key)
  WHERE legacy_wallet_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS treasury_accounts_restaurant_active_idx
  ON public.treasury_accounts (restaurant_id, is_active, branch_key);

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS account_id uuid NULL REFERENCES public.treasury_accounts(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS wallet_transactions_account_date_idx
  ON public.wallet_transactions (account_id, transaction_date DESC);

-- Default system accounts preserve the legacy wallet semantics and allow all
-- auto-generated wallet entries to link to an account immediately.
INSERT INTO public.treasury_accounts (
  restaurant_id, account_name, account_type, currency, legacy_wallet_key, is_system, is_active, notes
)
SELECT r.id, 'Owner Network', 'network_pos', COALESCE(NULLIF(r.currency, ''), 'SAR'), 'owner_network', true, true,
       'System account mapped from the existing owner_network wallet.'
FROM public.restaurants r
WHERE r.id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.treasury_accounts (
  restaurant_id, account_name, account_type, currency, legacy_wallet_key, is_system, is_active, notes
)
SELECT r.id, 'Owner Cash', 'cash', COALESCE(NULLIF(r.currency, ''), 'SAR'), 'owner_cash', true, true,
       'System account mapped from the existing owner_cash wallet.'
FROM public.restaurants r
WHERE r.id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.treasury_accounts (
  restaurant_id, branch_id, branch_key, account_name, account_type, currency, legacy_wallet_key, is_system, is_active, notes
)
SELECT b.restaurant_id, b.id, b.branch_key, COALESCE(NULLIF(b.name, ''), b.branch_key) || ' Cash', 'cash',
       COALESCE(NULLIF(r.currency, ''), 'SAR'), 'branch_cash', true, true,
       'System account mapped from the existing branch_cash wallet.'
FROM public.branches b
JOIN public.restaurants r ON r.id = b.restaurant_id
WHERE b.restaurant_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Historical data can contain valid restaurant/branch values that no longer
-- exist in branches. Preserve that history in a scoped legacy branch account.
INSERT INTO public.treasury_accounts (
  restaurant_id, branch_key, account_name, account_type, currency, legacy_wallet_key, is_system, is_active, notes
)
SELECT DISTINCT wt.restaurant_id, NULLIF(wt.branch, ''),
       COALESCE(NULLIF(wt.branch, ''), 'Legacy Branch') || ' Cash', 'cash',
       COALESCE(NULLIF(r.currency, ''), 'SAR'), 'branch_cash', true, true,
       'System account retained for historical branch_cash wallet entries.'
FROM public.wallet_transactions wt
JOIN public.restaurants r ON r.id = wt.restaurant_id
WHERE wt.restaurant_id IS NOT NULL
  AND wt.wallet = 'branch_cash'
  AND NULLIF(wt.branch, '') IS NOT NULL
ON CONFLICT DO NOTHING;

-- Repair the current production wallet trigger before the account backfill.
-- wallet_transactions has `branch`, not `branch_key`; the prior generic trigger
-- attempted to access both through a RECORD and raised a runtime error on updates.
DO $treasury_trigger_fix$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'trg_auto_cash_movement_and_recalculate'
  LIMIT 1;

  IF v_definition IS NOT NULL THEN
    v_definition := replace(
      v_definition,
      E'ELSIF TG_TABLE_NAME = \'wallet_transactions\' THEN\n    v_date := v_row.transaction_date;\n    v_branch := COALESCE(v_row.branch_key, v_row.branch);',
      E'ELSIF TG_TABLE_NAME = \'wallet_transactions\' THEN\n    v_date := v_row.transaction_date;\n    v_branch := v_row.branch;'
    );
    EXECUTE v_definition;
  END IF;
END;
$treasury_trigger_fix$;

-- Backfill all tenant-scoped wallet transactions. Historical rows without a
-- restaurant scope intentionally remain unchanged rather than being assigned
-- across tenants.
UPDATE public.wallet_transactions wt
SET account_id = a.id
FROM public.treasury_accounts a
WHERE wt.account_id IS NULL
  AND wt.restaurant_id = a.restaurant_id
  AND wt.wallet = a.legacy_wallet_key
  AND a.is_system = true
  AND (
    (wt.wallet = 'branch_cash' AND a.branch_key = NULLIF(wt.branch, ''))
    OR
    (wt.wallet <> 'branch_cash' AND a.branch_key IS NULL)
  );

CREATE OR REPLACE FUNCTION public.treasury_account_is_owner(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.restaurant_id = p_restaurant_id
      AND lower(COALESCE(p.role, '')) IN ('owner', 'admin', 'restaurant_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.treasury_account_assign_wallet_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_account public.treasury_accounts;
BEGIN
  IF NEW.account_id IS NOT NULL THEN
    SELECT * INTO matched_account
    FROM public.treasury_accounts a
    WHERE a.id = NEW.account_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Treasury account does not exist';
    END IF;
    IF matched_account.restaurant_id IS DISTINCT FROM NEW.restaurant_id THEN
      RAISE EXCEPTION 'Treasury account belongs to a different restaurant';
    END IF;
    IF matched_account.is_active IS NOT TRUE THEN
      RAISE EXCEPTION 'Treasury account is inactive';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.restaurant_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO matched_account
  FROM public.treasury_accounts a
  WHERE a.restaurant_id = NEW.restaurant_id
    AND a.is_active = true
    AND a.is_system = true
    AND a.legacy_wallet_key = NEW.wallet
    AND (
      (NEW.wallet = 'branch_cash' AND a.branch_key = NULLIF(NEW.branch, ''))
      OR
      (NEW.wallet <> 'branch_cash' AND a.branch_key IS NULL)
    )
  ORDER BY a.created_date
  LIMIT 1;

  IF FOUND THEN
    NEW.account_id := matched_account.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS treasury_account_assign_wallet_transaction ON public.wallet_transactions;
CREATE TRIGGER treasury_account_assign_wallet_transaction
BEFORE INSERT OR UPDATE OF account_id, wallet, branch, restaurant_id
ON public.wallet_transactions
FOR EACH ROW
EXECUTE FUNCTION public.treasury_account_assign_wallet_transaction();

CREATE OR REPLACE FUNCTION public.treasury_account_prevent_unsafe_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_system THEN
    RAISE EXCEPTION 'System-mapped Treasury accounts cannot be deleted; deactivate custom accounts instead.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.wallet_transactions wt WHERE wt.account_id = OLD.id) THEN
    RAISE EXCEPTION 'Treasury accounts with transactions cannot be deleted; deactivate the account instead.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS treasury_account_prevent_unsafe_delete ON public.treasury_accounts;
CREATE TRIGGER treasury_account_prevent_unsafe_delete
BEFORE DELETE ON public.treasury_accounts
FOR EACH ROW
EXECUTE FUNCTION public.treasury_account_prevent_unsafe_delete();

ALTER TABLE public.treasury_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS treasury_accounts_scope_select ON public.treasury_accounts;
CREATE POLICY treasury_accounts_scope_select
ON public.treasury_accounts
FOR SELECT
TO authenticated
USING (
  erp_can_access_scope_text(
    COALESCE(restaurant_id::text, ''),
    COALESCE(branch_id::text, '')
  )
);

DROP POLICY IF EXISTS treasury_accounts_owner_insert ON public.treasury_accounts;
CREATE POLICY treasury_accounts_owner_insert
ON public.treasury_accounts
FOR INSERT
TO authenticated
WITH CHECK (public.treasury_account_is_owner(restaurant_id));

DROP POLICY IF EXISTS treasury_accounts_owner_update ON public.treasury_accounts;
CREATE POLICY treasury_accounts_owner_update
ON public.treasury_accounts
FOR UPDATE
TO authenticated
USING (public.treasury_account_is_owner(restaurant_id))
WITH CHECK (public.treasury_account_is_owner(restaurant_id));

DROP POLICY IF EXISTS treasury_accounts_owner_delete ON public.treasury_accounts;
CREATE POLICY treasury_accounts_owner_delete
ON public.treasury_accounts
FOR DELETE
TO authenticated
USING (public.treasury_account_is_owner(restaurant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.treasury_accounts TO authenticated;
GRANT EXECUTE ON FUNCTION public.treasury_account_is_owner(uuid) TO authenticated;
