-- Synthetic fixtures and every posting are rolled back before returning.
DO $qa$
BEGIN
 BEGIN
  DECLARE u uuid:=gen_random_uuid(); tenant uuid; b uuid; bk text; cash uuid:=gen_random_uuid(); own uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); result jsonb; denied boolean; balance numeric; d date:=(now() AT TIME ZONE 'Asia/Riyadh')::date;
  BEGIN
   INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES(u,'closing-wallet-qa-'||u||'@example.invalid',now(),'{"role":"owner","full_name":"QA","company_name":"Closing rollback QA","branch_name":"QA","business_type":"services"}');
   SELECT restaurant_id INTO tenant FROM public.erp_memberships WHERE user_id=u LIMIT 1;
   SELECT id,branch_key INTO b,bk FROM public.branches WHERE restaurant_id=tenant LIMIT 1;
   ASSERT tenant IS NOT NULL AND b IS NOT NULL,'fixture scope missing';
   UPDATE public.restaurants SET currency='SAR' WHERE id=tenant;
   INSERT INTO public.treasury_accounts(id,restaurant_id,branch_id,branch_key,account_name,account_type,currency,opening_balance) VALUES(cash,tenant,b,bk,'Branch reserve','cash','SAR',200),(own,tenant,NULL,NULL,'Owner reserve','cash','SAR',300);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
   SET LOCAL ROLE authenticated;
   result:=public.erp_closing_funding_accounts(tenant,b,'SAR');
   ASSERT jsonb_array_length(result)>=2,'accounts unavailable';
   result:=public.erp_fund_sales_closing_drawer(req,tenant,b,d,'Morning',u,50,'restaurant',cash,NULL,'QA received cash',true,false);
   ASSERT result->>'status'='posted','branch funding failed';
   result:=public.erp_fund_sales_closing_drawer(req,tenant,b,d,'Morning',u,50,'restaurant',cash,NULL,'QA received cash',true,false);
   ASSERT result->>'status'='already_posted','retry duplicated';
   ASSERT (SELECT count(*) FROM public.wallet_transactions WHERE settlement_request_id=req)=1,'duplicate wallet debit';
   ASSERT (SELECT count(*) FROM public.cash_movements WHERE settlement_request_id=req)=1,'duplicate drawer receipt';
   denied:=false;BEGIN PERFORM public.erp_fund_sales_closing_drawer(req,tenant,b,d,'Morning',u,51,'restaurant',cash,NULL,'QA received cash',true,false);EXCEPTION WHEN raise_exception THEN denied:=true;END;ASSERT denied,'changed replay accepted';
   denied:=false;BEGIN PERFORM public.erp_fund_sales_closing_drawer(gen_random_uuid(),tenant,b,d,'Morning',u,151,'restaurant',cash,NULL,'QA received cash',true,false);EXCEPTION WHEN raise_exception THEN denied:=true;END;ASSERT denied,'wallet overspent';
   denied:=false;BEGIN PERFORM public.erp_fund_sales_closing_drawer(gen_random_uuid(),tenant,b,d,'Morning',u,1,'restaurant',own,NULL,'QA received cash',true,false);EXCEPTION WHEN raise_exception THEN denied:=true;END;ASSERT denied,'owner account accepted as branch wallet';
   denied:=false;BEGIN UPDATE public.wallet_transactions SET amount=1 WHERE settlement_request_id=req;EXCEPTION WHEN raise_exception THEN denied:=true;END;ASSERT denied,'posted debit mutable';
   result:=public.erp_fund_sales_closing_drawer(gen_random_uuid(),tenant,b,d,'Morning',u,40,'treasury',own,cash,'QA received cash',true,true);
   ASSERT result->>'status'='posted','owner funding failed';
   SELECT 200+coalesce(sum(CASE WHEN direction='in' THEN amount ELSE -amount END),0) INTO balance FROM public.wallet_transactions WHERE account_id=cash;
   ASSERT balance=190,'branch wallet balance wrong';
   ASSERT (SELECT coalesce(sum(amount),0) FROM public.cash_movements WHERE restaurant_id=tenant AND direction='in')=90,'cash receipts wrong';
   ASSERT NOT has_function_privilege('anon','public.erp_closing_funding_accounts(uuid,uuid,text)','execute'),'anonymous access';
   RAISE EXCEPTION 'QA_ROLLBACK';
  END;
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'QA_ROLLBACK' THEN RAISE;END IF;
 END;
END;$qa$;
SELECT 'Two-wallet funding checks passed; fixtures rolled back' AS result;
