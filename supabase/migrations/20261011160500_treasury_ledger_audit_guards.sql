-- ERP Treasury audit safeguards, prospective only. No balance backfill or historic edit.
BEGIN;
CREATE OR REPLACE FUNCTION public.erp_guard_posted_treasury_history()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
BEGIN
 IF TG_OP='DELETE' AND (
   OLD.auto_generated IS TRUE OR OLD.settlement_request_id IS NOT NULL OR
   OLD.transaction_type IN ('network_sales_auto','network_sales_auto_v2',
    'owner_branch_funding_debit','owner_to_branch_funding','closing_settlement',
    'branch_owner_cash_handover_debit','branch_to_owner_cash')
 ) THEN
    RAISE EXCEPTION 'ERP_POSTED_TREASURY_IMMUTABLE';
 END IF;
 IF TG_OP='UPDATE' AND OLD.transaction_type IN
   ('owner_branch_funding_debit','owner_to_branch_funding',
    'branch_owner_cash_handover_debit','branch_to_owner_cash') AND
   OLD.reference_id IS NOT NULL
   THEN RAISE EXCEPTION 'ERP_FUNDED_TRANSFER_IMMUTABLE';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
DROP TRIGGER IF EXISTS trg_erp_guard_posted_treasury_history ON public.wallet_transactions;
CREATE TRIGGER trg_erp_guard_posted_treasury_history
 BEFORE UPDATE OR DELETE ON public.wallet_transactions
 FOR EACH ROW EXECUTE FUNCTION public.erp_guard_posted_treasury_history();

CREATE OR REPLACE FUNCTION public.erp_guard_treasury_opening_balance()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
BEGIN
 IF OLD.opening_balance IS DISTINCT FROM NEW.opening_balance THEN
   IF OLD.is_system IS TRUE OR EXISTS (
     SELECT 1 FROM public.wallet_transactions w WHERE w.account_id=OLD.id LIMIT 1
   ) THEN
     RAISE EXCEPTION 'ERP_TREASURY_OPENING_BALANCE_LOCKED';
   END IF;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_erp_guard_treasury_opening_balance ON public.treasury_accounts;
CREATE TRIGGER trg_erp_guard_treasury_opening_balance
 BEFORE UPDATE OF opening_balance ON public.treasury_accounts
 FOR EACH ROW EXECUTE FUNCTION public.erp_guard_treasury_opening_balance();

-- Owner-authorized cash handover: a matched OUT from branch and IN to Owner.
-- Legacy one-sided receipts are not silently repaired or backfilled.
CREATE OR REPLACE FUNCTION public.erp_owner_receive_branch_cash(
 p_restaurant_id uuid,p_branch_id uuid,p_branch_account_id uuid,
 p_owner_account_id uuid,p_amount numeric,p_request_id uuid,
 p_note text DEFAULT '',p_owner_receipt_confirmed boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $treasury_handover$
DECLARE
 v_branch public.branches%ROWTYPE;
 v_source public.treasury_accounts%ROWTYPE;
 v_owner public.treasury_accounts%ROWTYPE;
 v_available numeric;
 v_date date:=(now() at time zone 'Asia/Riyadh')::date;
 v_debit uuid;v_credit uuid;
BEGIN
 IF NOT public.treasury_account_is_owner(p_restaurant_id) THEN
  RAISE EXCEPTION 'TREASURY_HANDOVER_PERMISSION_DENIED' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR p_branch_account_id=p_owner_account_id THEN
  RAISE EXCEPTION 'TREASURY_HANDOVER_REQUEST_INVALID';END IF;
 IF NOT p_owner_receipt_confirmed THEN
  RAISE EXCEPTION 'TREASURY_HANDOVER_RECEIPT_REQUIRED';END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount>1000000000 OR round(p_amount,2)<>p_amount THEN
  RAISE EXCEPTION 'TREASURY_HANDOVER_AMOUNT_INVALID';END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(
  'owner-branch-handover:'||p_restaurant_id::text||':'||p_request_id::text,0));
 IF EXISTS (SELECT 1 FROM public.wallet_transactions
   WHERE restaurant_id=p_restaurant_id AND transaction_type='branch_owner_cash_handover_debit'
    AND settlement_request_id=p_request_id) THEN
   IF EXISTS (SELECT 1 FROM public.wallet_transactions
       WHERE restaurant_id=p_restaurant_id AND transaction_type='branch_to_owner_cash'
       AND reference_id=p_request_id::text)
     THEN RETURN jsonb_build_object('status','already_posted','request_id',p_request_id);END IF;
   RAISE EXCEPTION 'TREASURY_HANDOVER_INCOMPLETE_TRANSFER';
 END IF;

 SELECT * INTO v_branch FROM public.branches
  WHERE id=p_branch_id AND restaurant_id=p_restaurant_id AND is_active IS DISTINCT FROM false;
 IF NOT FOUND THEN RAISE EXCEPTION 'TREASURY_HANDOVER_UNKNOWN_BRANCH'; END IF;
 SELECT * INTO v_source FROM public.treasury_accounts
  WHERE id=p_branch_account_id AND restaurant_id=p_restaurant_id AND is_active=true
   AND account_type IN ('cash','petty_cash')
   AND (branch_id=p_branch_id OR (branch_id IS NULL AND branch_key=v_branch.branch_key))
  FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TREASURY_HANDOVER_INVALID_BRANCH_ACCOUNT';END IF;
 SELECT * INTO v_owner FROM public.treasury_accounts
  WHERE id=p_owner_account_id AND restaurant_id=p_restaurant_id AND is_active=true
   AND account_type='cash' AND branch_id IS NULL AND branch_key IS NULL
  FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TREASURY_HANDOVER_INVALID_OWNER_CASH_ACCOUNT';END IF;
 IF v_source.currency IS DISTINCT FROM v_owner.currency THEN
  RAISE EXCEPTION 'TREASURY_HANDOVER_CURRENCY_MISMATCH'; END IF;

 SELECT COALESCE(v_source.opening_balance,0)+COALESCE(sum(
    CASE WHEN direction='out' THEN -amount ELSE amount END),0)
 INTO v_available FROM public.wallet_transactions WHERE account_id=v_source.id;
 IF p_amount>v_available THEN RAISE EXCEPTION 'TREASURY_HANDOVER_INSUFFICIENT_BALANCE';END IF;
 INSERT INTO public.wallet_transactions (
  transaction_date,transaction_type,flow_type,direction,wallet,
  branch,branch_id,amount,payment_method,description,reference_id,
  auto_generated,restaurant_id,account_id,settlement_request_id,recorded_by
 ) VALUES (
  v_date,'branch_owner_cash_handover_debit','branch_cash_handover','out','branch_cash',
  v_branch.branch_key,p_branch_id,p_amount,'cash',
  'Branch cash handed to Owner - '||left(COALESCE(p_note,''),200),
  p_request_id::text,false,p_restaurant_id,v_source.id,p_request_id,auth.uid()::text
 ) RETURNING id INTO v_debit;
 INSERT INTO public.wallet_transactions (
  transaction_date,transaction_type,flow_type,direction,wallet,
  branch,branch_id,amount,payment_method,description,reference_id,
  auto_generated,restaurant_id,account_id,recorded_by
 ) VALUES (
  v_date,'branch_to_owner_cash','branch_cash_handover','in','owner_cash',
  v_branch.branch_key,p_branch_id,p_amount,'cash',
  'Owner received branch cash - '||left(COALESCE(p_note,''),200),
  p_request_id::text,false,p_restaurant_id,v_owner.id,auth.uid()::text
 ) RETURNING id INTO v_credit;
 RETURN jsonb_build_object('status','posted','request_id',p_request_id,
  'debit_id',v_debit,'credit_id',v_credit,'branch_id',p_branch_id,'amount',p_amount);
END;
$treasury_handover$;
REVOKE ALL ON FUNCTION public.erp_owner_receive_branch_cash(uuid,uuid,uuid,uuid,numeric,uuid,text,boolean)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_owner_receive_branch_cash(uuid,uuid,uuid,uuid,numeric,uuid,text,boolean)
 TO authenticated;

COMMIT;
