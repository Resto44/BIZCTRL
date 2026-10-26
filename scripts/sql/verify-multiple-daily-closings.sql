-- Test-account fixture: every write, posting, and version is rolled back.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"d338f61c-22d5-49f4-84f1-f89b4da346fe","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE original public.daily_sales; payload jsonb; context jsonb; result jsonb; replay jsonb;
 ids uuid[]:=ARRAY[]::uuid[]; token uuid; request_id uuid; expected numeric; baseline numeric;
 before_fixed numeric; before_variable numeric; before_purchases numeric; n integer;
BEGIN
 SELECT * INTO original FROM public.daily_sales WHERE id='dae82fa6-82d2-4cfd-9c18-7eab2b3b55e2';
 ASSERT original.id IS NOT NULL;
 SELECT sum(total) INTO baseline FROM public.daily_sales WHERE restaurant_id=original.restaurant_id AND branch_id=original.branch_id AND date=original.date AND closing_state='finalized';
 context:=public.erp_closing_session_costs(original.restaurant_id::uuid,original.branch_id,original.branch,original.date,NULL);
 before_fixed:=(context->>'fixed_expense_today')::numeric;
 before_variable:=(context->>'variable_expenses_today')::numeric;
 before_purchases:=(context->>'approved_purchases_total')::numeric;
 FOR n IN 1..10 LOOP
  context:=public.erp_sales_closing_cash_context(original.restaurant_id::uuid,original.branch_id,original.branch,original.date,original.shift,original.cashier_id,NULL);
  expected:=(context->>'opening_cash')::numeric+(context->>'cash_in')::numeric-(context->>'cash_out')::numeric+n*10;
  ASSERT expected>=0,'Fixture needs posted funding before this test';
  token:=gen_random_uuid(); request_id:=gen_random_uuid();
  payload:=jsonb_build_object('restaurant_id',original.restaurant_id,'branch_id',original.branch_id,'branch',original.branch,'date',original.date,
   'shift',original.shift,'cashier_id',original.cashier_id,'cashier_name',original.cashier_name,'closing_state','finalized',
   'closing_session_id',token,'previous_closing_id',context->'previous_closing_id','restaurant_cash',n*10,'restaurant_network',0,'actual_cash',expected,
   'credit',0,'credit_entries_json','[]'::jsonb,'sales_sources_json','[]'::jsonb,'payment_reconciliation_json','[]'::jsonb,'pos_entries_json','[]'::jsonb);
  result:=public.erp_finalize_sales_closing(payload,NULL,request_id);
  ASSERT (result->'closing'->>'total')::numeric=n*10;
  ASSERT (result->'closing'->>'cash_difference')::numeric=0;
  ASSERT (result->'closing'->>'date')::date=original.date;
  ASSERT result->'closing'->>'id'<>original.id::text;
  ASSERT NOT ((result->'closing'->>'id')::uuid=ANY(ids));
  ids:=array_append(ids,(result->'closing'->>'id')::uuid);
  replay:=public.erp_finalize_sales_closing(payload,NULL,request_id);
  ASSERT replay->>'idempotent'='true';
  ASSERT replay->'closing'->>'id'=result->'closing'->>'id';
 END LOOP;
 ASSERT (SELECT count(*) FROM public.daily_sales WHERE id=ANY(ids))=10;
 ASSERT (SELECT sum(total) FROM public.daily_sales WHERE id=ANY(ids))=550;
 ASSERT (SELECT sum(total) FROM public.daily_sales WHERE restaurant_id=original.restaurant_id AND branch_id=original.branch_id AND date=original.date AND closing_state='finalized')=baseline+550;
 ASSERT (SELECT sum(fixed_expenses_total) FROM public.daily_sales WHERE id=ANY(ids))=before_fixed;
 ASSERT (SELECT sum(variable_expenses_total) FROM public.daily_sales WHERE id=ANY(ids))=before_variable;
 ASSERT (SELECT sum(approved_purchases_total) FROM public.daily_sales WHERE id=ANY(ids))=before_purchases;
 ASSERT (SELECT total FROM public.daily_sales WHERE id=original.id)=original.total;
 RAISE NOTICE 'PASS: ten separate records, same date, total +550, balanced carry-forward, retry idempotency, costs allocated once, original preserved';
END $$;
ROLLBACK;
