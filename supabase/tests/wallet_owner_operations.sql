BEGIN;
DO $test$
DECLARE u uuid:=gen_random_uuid(); pu uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); tenant uuid; person uuid:=gen_random_uuid();
 cash uuid:=gen_random_uuid(); usd uuid:=gen_random_uuid(); tx uuid:=gen_random_uuid(); rtn uuid:=gen_random_uuid(); req uuid:=gen_random_uuid();
 snap jsonb; denied boolean; n integer;
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
 (u,'wallet-owner-qa-'||u||'@example.invalid',now(),'{"role":"owner","full_name":"QA","company_name":"Wallet rollback QA","branch_name":"QA","business_type":"services"}');
 SELECT restaurant_id INTO tenant FROM public.erp_memberships WHERE user_id=u LIMIT 1;
 ASSERT tenant IS NOT NULL,'fixture tenant missing';
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
 (pu,'wallet-person-qa-'||pu||'@example.invalid',now(),'{"people_portal_registration":true}'),
 (outsider,'wallet-outsider-qa-'||outsider||'@example.invalid',now(),'{"people_portal_registration":true}');
 INSERT INTO public.business_partners(id,restaurant_id,name,email,user_id,created_by) VALUES
 (person,tenant,'Wallet QA','wallet-person-qa-'||pu||'@example.invalid',pu,u);
 INSERT INTO public.treasury_accounts(id,restaurant_id,account_name,account_type,currency,opening_balance) VALUES
 (cash,tenant,'QA cash','cash','SAR',100),(usd,tenant,'QA USD','cash','USD',100);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','wallet-owner-qa-'||u||'@example.invalid','role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',40,'SAR',tx,cash,'Owner funding QA');
 PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',40,'SAR',tx,cash,'Owner funding QA');
 PERFORM public.erp_bank_wallet_owner_transfer(person,'return_to_owner',10,'SAR',rtn,cash,'Owner return QA');
 SET CONSTRAINTS ALL IMMEDIATE;
 SET CONSTRAINTS ALL DEFERRED;
 snap:=public.erp_bank_wallet_owner_overview(tenant,'SAR');
 ASSERT (snap->'summary'->>'wallet_balance')::numeric=30,'wrong wallet total';
 ASSERT (SELECT (x->>'available_balance')::numeric FROM jsonb_array_elements(snap->'accounts')x WHERE x->>'id'=cash::text)=70,'wrong treasury total';
 ASSERT (snap->>'total')::int=2,'duplicate request posted';
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',41,'SAR',tx,cash,'Owner funding QA'); EXCEPTION WHEN unique_violation THEN denied:=true; END;ASSERT denied,'changed replay accepted';
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',71,'SAR',gen_random_uuid(),cash,'Insufficient QA'); EXCEPTION WHEN numeric_value_out_of_range THEN denied:=true; END;ASSERT denied,'treasury overspend';
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_owner_transfer(person,'return_to_owner',31,'SAR',gen_random_uuid(),cash,'Insufficient QA'); EXCEPTION WHEN numeric_value_out_of_range THEN denied:=true; END;ASSERT denied,'wallet overspend';
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',1,'SAR',gen_random_uuid(),usd,'Wrong currency QA'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;ASSERT denied,'currency mismatch allowed';
 RESET ROLE;
 UPDATE public.erp_bank_wallet_accounts SET status='frozen' WHERE person_id=person;
 SET LOCAL ROLE authenticated;
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',1,'SAR',gen_random_uuid(),cash,'Frozen wallet QA'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;ASSERT denied,'frozen wallet accepted';
 RESET ROLE;
 UPDATE public.erp_bank_wallet_accounts SET status='active' WHERE person_id=person;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',pu,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',1,'SAR',gen_random_uuid(),cash,'Person attack QA'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;ASSERT denied,'person can post owner transaction';
 PERFORM public.erp_bank_wallet_request(person,'fund_wallet',5,'SAR',req,'Beneficiary request QA');
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_owner_overview(tenant,'SAR'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;ASSERT denied,'tenant overview leak';
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',1,'SAR',gen_random_uuid(),cash,'Outsider attack QA'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;ASSERT denied,'outsider transfer accepted';
 RESET ROLE;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 snap:=public.erp_bank_wallet_owner_overview(tenant,'SAR','pending');
 ASSERT (snap->>'total')::int=1 AND (snap->'summary'->>'wallet_balance')::numeric=30,'pending affects balance';
 PERFORM public.erp_bank_wallet_review(req,true,cash,'Approve beneficiary QA');
 SET CONSTRAINTS ALL IMMEDIATE;
 SET CONSTRAINTS ALL DEFERRED;
 snap:=public.erp_bank_wallet_owner_overview(tenant,'SAR');
 ASSERT (snap->'summary'->>'wallet_balance')::numeric=35,'review regression';
 RESET ROLE;
 SELECT count(*) INTO n FROM public.erp_bank_wallet_postings WHERE restaurant_id=tenant;ASSERT n=6,'wrong double entry count';
 ASSERT (SELECT sum(signed_amount) FROM public.erp_bank_wallet_postings WHERE restaurant_id=tenant)=0,'unbalanced ledger';
 ASSERT NOT EXISTS(SELECT 1 FROM public.daily_sales WHERE restaurant_id=tenant::text),'wallet created sales';
 ASSERT NOT has_function_privilege('anon','public.erp_bank_wallet_owner_transfer(uuid,text,numeric,text,uuid,uuid,text)','execute'),'anonymous grant';
END $test$;
ROLLBACK;
