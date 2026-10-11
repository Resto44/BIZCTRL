-- ERP Treasury audit safeguards, prospective only. No balance backfill or historic edit.
BEGIN;
CREATE OR REPLACE FUNCTION public.erp_guard_posted_treasury_history()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
BEGIN
 IF TG_OP='DELETE' AND (
   OLD.auto_generated IS TRUE OR OLD.settlement_request_id IS NOT NULL OR
   OLD.transaction_type IN ('network_sales_auto','network_sales_auto_v2',
    'owner_branch_funding_debit','owner_to_branch_funding','closing_settlement')
 ) THEN
    RAISE EXCEPTION 'ERP_POSTED_TREASURY_IMMUTABLE';
 END IF;
 IF TG_OP='UPDATE' AND OLD.transaction_type IN
   ('owner_branch_funding_debit','owner_to_branch_funding') AND
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
COMMIT;
