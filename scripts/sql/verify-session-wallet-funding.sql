-- Separate rollback-only transaction: funding remains an atomic receipt, not sales.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"d338f61c-22d5-49f4-84f1-f89b4da346fe","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE original public.daily_sales; ctx jsonb; payload jsonb; result jsonb; replay jsonb;
 request_id uuid:=gen_random_uuid(); expected numeric; session_id uuid:=gen_random_uuid(); blocked boolean:=false;
BEGIN
 SELECT * INTO original FROM public.daily_sales WHERE id='dae82fa6-82d2-4cfd-9c18-7eab2b3b55e2';
 ctx:=public.erp_sales_closing_cash_context(original.restaurant_id::uuid,original.branch_id,original.branch,original.date,original.shift,original.cashier_id,NULL);
 expected:=(ctx->>'opening_cash')::numeric+(ctx->>'cash_in')::numeric-(ctx->>'cash_out')::numeric+10;
 payload:=jsonb_build_object('restaurant_id',original.restaurant_id,'branch_id',original.branch_id,'branch',original.branch,'date',original.date,
 'shift',original.shift,'cashier_id',original.cashier_id,'cashier_name',original.cashier_name,'closing_state','finalized',
 'closing_session_id',session_id,'previous_closing_id',ctx->'previous_closing_id','restaurant_cash',10,'restaurant_network',0,'actual_cash',expected+50,
 'credit_entries_json','[]'::jsonb,'sales_sources_json','[]'::jsonb,'payment_reconciliation_json','[]'::jsonb,'pos_entries_json','[]'::jsonb,
 'wallet_funding',jsonb_build_object('source','treasury','source_account_id','dc860b42-53c9-453e-8afc-d0ded386b37e','destination_account_id','a181bb8d-da46-42de-aa6b-7ffb818cab94','amount',50,'received',true));
 result:=public.erp_finalize_sales_closing_with_funding(payload,NULL,request_id);
 ASSERT (result->'closing'->>'total')::numeric=10;
 ASSERT (result->'closing'->>'cash_difference')::numeric=0;
 replay:=public.erp_finalize_sales_closing_with_funding(payload,NULL,request_id);
 ASSERT replay->>'idempotent'='true';
 ASSERT (SELECT count(*) FROM public.cash_movements WHERE settlement_request_id=request_id)=1;
 ctx:=public.erp_sales_closing_cash_context(original.restaurant_id::uuid,original.branch_id,original.branch,original.date,original.shift,original.cashier_id,NULL);
 ASSERT (ctx->>'opening_cash')::numeric=expected+50;
 ASSERT (ctx->>'cash_in')::numeric=0,'Previous session funding repeated';
 BEGIN
  PERFORM public.erp_finalize_sales_closing(to_jsonb(original),original.id,gen_random_uuid());
 EXCEPTION WHEN raise_exception THEN blocked:=SQLERRM='SALES_CLOSING_HAS_LATER_SESSION'; END;
 ASSERT blocked,'Earlier count could rewrite successor opening';
 ASSERT (SELECT total FROM public.daily_sales WHERE id=original.id)=original.total;
 RAISE NOTICE 'PASS: funding after previous finalized session, balanced closing, retry once, carry-forward without replaying funding, historical count protected';
END $$;
ROLLBACK;
