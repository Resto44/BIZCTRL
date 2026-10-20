CREATE OR REPLACE FUNCTION push_private.capture_wallet() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND (OLD.status=NEW.status OR NEW.status NOT IN('posted','rejected')) THEN RETURN NEW;END IF;
 IF TG_OP='INSERT' AND NEW.status<>'pending' THEN RETURN NEW;END IF;
 IF NEW.status IN('posted','rejected') THEN
  -- Receipt for both participants: the wallet holder and the owner who created/reviewed.
  INSERT INTO public.wallet_push_events(request_id,restaurant_id,recipient_id,recipient_role,status)
  SELECT NEW.id,NEW.restaurant_id,p.user_id,'beneficiary',NEW.status
  FROM public.business_partners p WHERE p.id=NEW.person_id AND p.restaurant_id=NEW.restaurant_id AND p.is_active AND p.user_id IS NOT NULL
  UNION
  SELECT NEW.id,NEW.restaurant_id,m.user_id,'owner',NEW.status FROM public.erp_memberships m
  WHERE m.restaurant_id=NEW.restaurant_id AND m.role='owner' AND m.status='approved'
   AND m.user_id IN(NEW.created_by,NEW.reviewed_by)
   AND NOT EXISTS(SELECT 1 FROM public.business_partners p WHERE p.id=NEW.person_id AND p.user_id=m.user_id)
  ON CONFLICT DO NOTHING;
 ELSIF NEW.status='pending' AND NOT NEW.initiated_by_owner THEN
  INSERT INTO public.wallet_push_events(request_id,restaurant_id,recipient_id,recipient_role,status)
  SELECT NEW.id,NEW.restaurant_id,m.user_id,'owner',NEW.status FROM public.erp_memberships m
  WHERE m.restaurant_id=NEW.restaurant_id AND m.role='owner' AND m.status='approved' AND m.user_id<>NEW.created_by
  ON CONFLICT DO NOTHING;
 ELSE
  INSERT INTO public.wallet_push_events(request_id,restaurant_id,recipient_id,recipient_role,status)
  SELECT NEW.id,NEW.restaurant_id,CASE WHEN NEW.status='pending' THEN p.user_id ELSE NEW.created_by END,
   CASE WHEN NEW.status='pending' OR NOT NEW.initiated_by_owner THEN 'beneficiary' ELSE 'owner' END,NEW.status
  FROM public.business_partners p WHERE p.id=NEW.person_id AND p.restaurant_id=NEW.restaurant_id AND p.is_active AND p.user_id IS NOT NULL
  ON CONFLICT DO NOTHING;
 END IF;
 INSERT INTO public.wallet_push_deliveries(event_id,device_id)
 SELECT e.id,d.id FROM public.wallet_push_events e JOIN public.wallet_push_devices d
 ON d.user_id=e.recipient_id AND d.restaurant_id=e.restaurant_id AND d.enabled
 WHERE e.request_id=NEW.id AND e.status=NEW.status ON CONFLICT DO NOTHING;
 RETURN NEW;
END;$$;

DO $validation$
BEGIN
 BEGIN
 DECLARE u uuid:=gen_random_uuid(); pu uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); tenant uuid; person uuid:=gen_random_uuid();
 cash uuid:=gen_random_uuid(); usd uuid:=gen_random_uuid(); tx uuid:=gen_random_uuid(); rtn uuid:=gen_random_uuid(); req uuid:=gen_random_uuid();
 snap jsonb; full_history jsonb; denied boolean; n integer;
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

 INSERT INTO public.wallet_push_devices(user_id,restaurant_id,endpoint,p256dh,auth_key,language) VALUES
 (u,tenant,'https://web.push.apple.com/test-'||u,repeat('a',87),repeat('a',22),'en'),
 (pu,tenant,'https://web.push.apple.com/test-'||pu,repeat('b',87),repeat('b',22),'fa'),
 (outsider,tenant,'https://web.push.apple.com/test-'||outsider,repeat('c',87),repeat('c',22),'ar');
 SELECT count(*) INTO n FROM net.http_request_queue WHERE url LIKE '%/wallet-push/dispatch';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','wallet-owner-qa-'||u||'@example.invalid','role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',40,'SAR',tx,cash,'Owner funding QA');
 PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',40,'SAR',tx,cash,'Owner funding QA');


 RESET ROLE;
 ASSERT (SELECT count(*) FROM net.http_request_queue WHERE url LIKE '%/wallet-push/dispatch')=n+1,'immediate dispatch missing or duplicated';
 ASSERT NOT has_function_privilege('authenticated','push_private.wallet_push_wake()','execute'),'client can invoke wake';
 ASSERT (SELECT count(*) FROM public.wallet_push_events WHERE request_id=tx)=1,'duplicate pending event';
 ASSERT (SELECT recipient_id FROM public.wallet_push_events WHERE request_id=tx)=pu,'owner request notified wrong person';
 ASSERT (SELECT count(*) FROM public.wallet_push_deliveries d JOIN public.wallet_push_events e ON e.id=d.event_id WHERE e.request_id=tx)=1,'wrong initial delivery count';
 SET LOCAL ROLE authenticated;
 snap:=public.erp_bank_wallet_owner_overview(tenant,'SAR');
 ASSERT (snap->'summary'->>'wallet_balance')::numeric=0,'pending owner request moved wallet funds';
 ASSERT (SELECT (x->>'available_balance')::numeric FROM jsonb_array_elements(snap->'accounts')x WHERE x->>'id'=cash::text)=100,'pending owner request moved treasury funds';
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_review(tx,true,cash,'Self approval QA'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;ASSERT denied,'owner self approval accepted';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
 denied:=false;BEGIN PERFORM public.erp_wallet_push_record(tx); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;ASSERT denied,'outsider deep-link leak';
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_review(tx,true,NULL,'Outsider approval QA'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;ASSERT denied,'outsider approval accepted';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',pu,'email','wallet-person-qa-'||pu||'@example.invalid','role','authenticated')::text,true);
 ASSERT (public.erp_wallet_push_record(tx)->>'person_id')::uuid=person,'deep link wrong person';
 snap:=public.erp_bank_wallet_dashboard(person,1);
 ASSERT jsonb_array_length(snap->'pending_requests')=1,'missing beneficiary queue';
 ASSERT (snap->'pending_requests'->0->>'initiated_by_owner')::boolean,'missing origin flag';
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_review(tx,true,usd,'Changed account QA'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;ASSERT denied,'beneficiary changed treasury account';
 PERFORM public.erp_bank_wallet_review(tx,true,NULL,'Beneficiary approves funding');
 PERFORM public.erp_bank_wallet_review(tx,true,NULL,'Beneficiary approves funding');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','wallet-owner-qa-'||u||'@example.invalid','role','authenticated')::text,true); PERFORM public.erp_bank_wallet_owner_transfer(person,'return_to_owner',10,'SAR',rtn,cash,'Owner return QA');
 snap:=public.erp_bank_wallet_owner_overview(tenant,'SAR');
 ASSERT (snap->'summary'->>'wallet_balance')::numeric=40,'pending return debited wallet';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',pu,'email','wallet-person-qa-'||pu||'@example.invalid','role','authenticated')::text,true);
 PERFORM public.erp_bank_wallet_review(rtn,true,NULL,'Beneficiary approves return');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','wallet-owner-qa-'||u||'@example.invalid','role','authenticated')::text,true);
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
 snap:=public.erp_bank_wallet_owner_timeline(tenant,'SAR','pending');
 ASSERT (snap->>'total')::int=1,'pending timeline count';
 ASSERT snap->'transactions'->0->>'balance_after' IS NULL,'pending fabricated balance';
 PERFORM public.erp_bank_wallet_review(req,true,cash,'Approve beneficiary QA');
 SET CONSTRAINTS ALL IMMEDIATE;
 SET CONSTRAINTS ALL DEFERRED;
 snap:=public.erp_bank_wallet_owner_overview(tenant,'SAR');
 ASSERT (snap->'summary'->>'wallet_balance')::numeric=35,'review regression';
 full_history:=public.erp_bank_wallet_owner_timeline(tenant,'SAR');
 snap:=public.erp_bank_wallet_owner_timeline(tenant,'SAR','incoming',0,'','Asia/Riyadh','Wallet QA');
 ASSERT (snap->>'total')::int=1,'incoming filter';
 ASSERT snap->'transactions'->0->'balance_after'=(SELECT x->'balance_after' FROM jsonb_array_elements(full_history->'transactions')x WHERE x->>'id'=rtn::text),'filter corrupts running balance';
 ASSERT (snap->'transactions'->0->>'balance_before')::numeric-(snap->'transactions'->0->>'balance_after')::numeric=10,'return balance delta';
 ASSERT snap->'transactions'->0->>'activity_day'=to_char(now() AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD'),'local day mismatch';
 snap:=public.erp_bank_wallet_owner_timeline(tenant,'SAR','outgoing');
 ASSERT (snap->>'total')::int=2,'outgoing filter';
 snap:=public.erp_bank_wallet_owner_timeline(tenant,'SAR','all',50);
 ASSERT (snap->>'total')::int=3 AND jsonb_array_length(snap->'transactions')=0,'pagination count';
 snap:=public.erp_bank_wallet_owner_timeline(tenant,'SAR','all',0,'1900-01');
 ASSERT (snap->>'total')::int=0,'month filter';
 RESET ROLE;
 SELECT count(*) INTO n FROM public.erp_bank_wallet_postings WHERE restaurant_id=tenant;ASSERT n=6,'wrong double entry count';
 ASSERT (SELECT sum(signed_amount) FROM public.erp_bank_wallet_postings WHERE restaurant_id=tenant)=0,'unbalanced ledger';
 ASSERT NOT EXISTS(SELECT 1 FROM public.daily_sales WHERE restaurant_id=tenant::text),'wallet created sales';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_owner_timeline(tenant,'SAR'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;ASSERT denied,'timeline tenant leak';
 RESET ROLE;

 -- Rejection leaves both ledgers unchanged. Replaying submission cannot resurrect it.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','wallet-owner-qa-'||u||'@example.invalid','role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 req:=gen_random_uuid();
 PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',5,'SAR',req,cash,'Rejection testing');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',pu,'email','wallet-person-qa-'||pu||'@example.invalid','role','authenticated')::text,true);
 PERFORM public.erp_bank_wallet_review(req,false,NULL,'Beneficiary rejects transfer');
 PERFORM public.erp_bank_wallet_review(req,false,NULL,'Beneficiary rejects transfer');
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_review(req,true,NULL,'Approve rejected transfer'); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;ASSERT denied,'rejected request posted';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','wallet-owner-qa-'||u||'@example.invalid','role','authenticated')::text,true);
 PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',5,'SAR',req,cash,'Rejection testing');
 snap:=public.erp_bank_wallet_owner_overview(tenant,'SAR');
 ASSERT (snap->'summary'->>'wallet_balance')::numeric=35,'rejection affected funds';
 -- Two individually valid pending requests cannot spend the same balance twice.
 tx:=gen_random_uuid();rtn:=gen_random_uuid();
 PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',60,'SAR',tx,cash,'Pending funding one');
 PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',60,'SAR',rtn,cash,'Pending funding two');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',pu,'email','wallet-person-qa-'||pu||'@example.invalid','role','authenticated')::text,true);
 snap:=public.erp_bank_wallet_dashboard(person,1);
 ASSERT jsonb_array_length(snap->'pending_requests')=2,'pending queue truncated by history limit';
 PERFORM public.erp_bank_wallet_review(tx,true,NULL,'Approve first funding');
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_review(rtn,true,NULL,'Approve second funding'); EXCEPTION WHEN numeric_value_out_of_range THEN denied:=true; END;ASSERT denied,'approval failed to recheck treasury funds';
 PERFORM public.erp_bank_wallet_review(rtn,false,NULL,'Reject unfunded request');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','wallet-owner-qa-'||u||'@example.invalid','role','authenticated')::text,true);
 tx:=gen_random_uuid();rtn:=gen_random_uuid();
 PERFORM public.erp_bank_wallet_owner_transfer(person,'return_to_owner',90,'SAR',tx,cash,'Pending return one');
 PERFORM public.erp_bank_wallet_owner_transfer(person,'return_to_owner',90,'SAR',rtn,cash,'Pending return two');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',pu,'email','wallet-person-qa-'||pu||'@example.invalid','role','authenticated')::text,true);
 PERFORM public.erp_bank_wallet_review(tx,true,NULL,'Approve first return');
 denied:=false;BEGIN PERFORM public.erp_bank_wallet_review(rtn,true,NULL,'Approve second return'); EXCEPTION WHEN numeric_value_out_of_range THEN denied:=true; END;ASSERT denied,'approval failed to recheck beneficiary funds';
 PERFORM public.erp_bank_wallet_review(rtn,false,NULL,'Reject unfunded return');
 RESET ROLE;
 SET CONSTRAINTS ALL IMMEDIATE;
 ASSERT (SELECT count(*) FROM public.erp_bank_wallet_postings WHERE restaurant_id=tenant)=10,'duplicate approval postings';
 ASSERT (SELECT sum(signed_amount) FROM public.erp_bank_wallet_postings WHERE restaurant_id=tenant)=0,'unbalanced approval ledger';
 ASSERT (SELECT count(*) FROM public.wallet_transactions WHERE restaurant_id=tenant)=5,'wrong treasury posting count';

 ASSERT NOT EXISTS(SELECT 1 FROM public.wallet_push_events WHERE restaurant_id=tenant AND recipient_id=outsider),'outsider received event';
 ASSERT NOT EXISTS(SELECT 1 FROM public.wallet_push_events e JOIN public.erp_bank_wallet_requests q ON q.id=e.request_id
 WHERE e.restaurant_id=tenant AND ((e.status='pending' AND q.initiated_by_owner AND e.recipient_id<>pu)
 OR (e.status='pending' AND NOT q.initiated_by_owner AND e.recipient_id<>u)
 OR (e.status<>'pending' AND e.recipient_id NOT IN(u,pu)))),'wrong notification recipient';
 ASSERT NOT EXISTS(SELECT 1 FROM public.erp_bank_wallet_requests q WHERE q.restaurant_id=tenant AND q.status IN('posted','rejected')
 AND (SELECT count(*) FROM public.wallet_push_events e WHERE e.request_id=q.id AND e.status=q.status)<>2),'missing receipt for either participant';
 ASSERT NOT EXISTS(SELECT 1 FROM public.erp_bank_wallet_requests q WHERE q.restaurant_id=tenant AND q.status IN('posted','rejected')
 AND (SELECT count(*) FROM public.wallet_push_deliveries d JOIN public.wallet_push_events e ON e.id=d.event_id WHERE e.request_id=q.id AND e.status=q.status)<>2),'missing result delivery';
 ASSERT NOT EXISTS(SELECT 1 FROM public.wallet_push_events WHERE restaurant_id=tenant GROUP BY request_id,status,recipient_id HAVING count(*)>1),'duplicate event';
 ASSERT NOT has_function_privilege('authenticated','public.wallet_push_claim()','execute'),'client can claim queue';
 ASSERT NOT has_function_privilege('authenticated','public.wallet_push_register(uuid,uuid,jsonb,text)','execute'),'client bypasses registration checks';
 ASSERT NOT has_table_privilege('authenticated','public.wallet_push_devices','select'),'device keys exposed';
 ASSERT NOT has_table_privilege('authenticated','public.wallet_push_events','select'),'recipient events exposed';
 ASSERT NOT has_function_privilege('anon','public.erp_wallet_push_record(uuid)','execute'),'anonymous deep links';
 ASSERT NOT has_function_privilege('anon','public.erp_bank_wallet_owner_transfer(uuid,text,numeric,text,uuid,uuid,text)','execute'),'anonymous grant';
END;
 RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='wallet receipt validation rollback';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
END $validation$;
