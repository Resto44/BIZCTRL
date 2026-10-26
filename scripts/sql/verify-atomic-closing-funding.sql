-- Run with psql variables or replace these SET values in a rollback-only test.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"d338f61c-22d5-49f4-84f1-f89b4da346fe","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE original public.daily_sales; payload jsonb; first_result jsonb; retry_result jsonb; request_id uuid:=gen_random_uuid(); n integer; blocked boolean;
BEGIN
 SELECT * INTO original FROM public.daily_sales WHERE id='dae82fa6-82d2-4cfd-9c18-7eab2b3b55e2';
 payload:=to_jsonb(original)||jsonb_build_object('restaurant_cash',0,'cash',0,'restaurant_network',505,
 'wallet_funding',jsonb_build_object('source','treasury','source_account_id','dc860b42-53c9-453e-8afc-d0ded386b37e',
 'destination_account_id','a181bb8d-da46-42de-aa6b-7ffb818cab94','amount',289,'received',true));
 first_result:=public.erp_finalize_sales_closing_with_funding(payload,original.id,request_id);
 ASSERT first_result->'closing'->>'cash_status'='Balanced';
 ASSERT (first_result->'closing'->>'total')::numeric=original.total;
 ASSERT (first_result->'closing'->>'actual_cash')::numeric=original.actual_cash;
 ASSERT (first_result->'closing'->>'closing_version')::int=original.closing_version+1;
 retry_result:=public.erp_finalize_sales_closing_with_funding(payload,original.id,request_id);
 ASSERT retry_result->>'idempotent'='true';
 SELECT count(*) INTO n FROM public.cash_movements WHERE settlement_request_id=request_id;
 ASSERT n=1,'Duplicate funding receipt';
 blocked:=false;
 BEGIN PERFORM public.erp_finalize_sales_closing_with_funding(jsonb_set(payload,'{actual_cash}','181'),original.id,request_id);
 EXCEPTION WHEN raise_exception THEN blocked:=SQLERRM='CLOSING_FUNDING_REQUEST_CONFLICT'; END;
 ASSERT blocked,'Changed retry payload accepted';
 SELECT count(*) INTO n FROM public.sales_closing_funding_requests WHERE restaurant_id=original.restaurant_id::uuid;
 blocked:=false;
 BEGIN PERFORM public.erp_finalize_sales_closing_with_funding(jsonb_set(payload,'{wallet_funding,amount}','1'),original.id,gen_random_uuid());
 EXCEPTION WHEN raise_exception THEN blocked:=SQLERRM='CLOSING_FUNDING_PREVIEW_CHANGED'; END;
 ASSERT blocked,'Stale preview accepted';
 ASSERT n=(SELECT count(*) FROM public.sales_closing_funding_requests WHERE restaurant_id=original.restaurant_id::uuid),'Failed closing retained a debit';
 blocked:=false;
 BEGIN PERFORM public.erp_finalize_sales_closing_with_funding(jsonb_set(payload,'{wallet_funding,amount}','99999999'),original.id,gen_random_uuid());
 EXCEPTION WHEN raise_exception THEN blocked:=SQLERRM LIKE '%INSUFFICIENT%'; END;
 ASSERT blocked,'Insufficient funds accepted';
 ASSERT NOT has_function_privilege('anon','public.erp_finalize_sales_closing_with_funding(jsonb,uuid,uuid)','EXECUTE');
 ASSERT NOT (SELECT has_function_privilege('authenticated',p.oid,'EXECUTE') FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='closing_funding_private' AND p.proname='post');
 RAISE NOTICE 'PASS: atomic correction, sales/count preservation, immutable version, replay, conflict, stale preview rollback, insufficient funds, grants';
END;$$;
ROLLBACK;
