BEGIN;
DO $repair$
DECLARE
 c public.daily_sales%ROWTYPE;
 d public.debt_records%ROWTYPE;
 before_row jsonb;
 entries jsonb;
 principal numeric;
 collected numeric;
BEGIN
 SELECT * INTO c FROM public.daily_sales WHERE id='be410102-a985-45ca-b315-0cb3158ec800' FOR UPDATE;
 IF c.restaurant_id IS DISTINCT FROM 'c9e3506b-cc38-4307-a561-d9e227a99224' OR c.closing_state <> 'finalized' OR c.closing_version <> 8 THEN RAISE EXCEPTION 'REPAIR_CLOSING_CHANGED'; END IF;
 SELECT credit_entries_json INTO entries FROM public.sales_closing_finalized_versions WHERE closing_id=c.id AND version=c.closing_version;
 IF entries IS DISTINCT FROM c.credit_entries_json OR jsonb_array_length(entries) <> 1 THEN RAISE EXCEPTION 'REPAIR_SNAPSHOT_MISMATCH'; END IF;
 principal := (entries->0->>'amount')::numeric;
 IF principal <> 60 OR c.credit <> 60 THEN RAISE EXCEPTION 'REPAIR_PRINCIPAL_CHANGED'; END IF;
 SELECT * INTO d FROM public.debt_records WHERE id='b29561bb-c0f2-4b9b-bf4f-7ece19a4dad2' AND sales_closing_id=c.id FOR UPDATE;
 IF NOT FOUND OR d.customer_id IS DISTINCT FROM (entries->0->>'customer_id')::uuid OR d.restaurant_id::text IS DISTINCT FROM c.restaurant_id THEN RAISE EXCEPTION 'REPAIR_DEBT_MISMATCH'; END IF;
 IF d.total_amount=60 AND d.paid_amount=50 AND d.remaining_amount=10 THEN RETURN; END IF;
 IF d.total_amount<>50 OR d.paid_amount<>50 OR d.remaining_amount<>0 THEN RAISE EXCEPTION 'REPAIR_BALANCE_CHANGED'; END IF;
 SELECT COALESCE(sum(amount),0) INTO collected FROM public.debt_payments WHERE debt_id=d.id;
 IF collected<>50 THEN RAISE EXCEPTION 'REPAIR_PAYMENT_MISMATCH'; END IF;
 before_row:=to_jsonb(d);
 UPDATE public.debt_records SET total_amount=principal, remaining_amount=principal-collected,status='partial',updated_date=now() WHERE id=d.id RETURNING * INTO d;
 INSERT INTO public.sales_closing_audit_log(closing_id,restaurant_id,actor_role,action,field_name,old_value,new_value,reason)
 VALUES(c.id,c.restaurant_id,'system','customer_credit_reconciliation','debt_records',before_row,to_jsonb(d),'Repair authorized customer-credit bug: reconcile linked receivable with immutable finalized version 8 (60 SAR), preserving all 50 SAR recorded payments and historical closing versions. No cash movement or new sale.');
 PERFORM public.erp_refresh_customer_receivable_cache(d.customer_id);
END;
$repair$;
COMMIT;
