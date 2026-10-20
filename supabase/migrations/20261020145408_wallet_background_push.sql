-- Wallet-only notification subscriptions, transactional events and retry queue.
CREATE TABLE public.wallet_push_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
 endpoint text NOT NULL CHECK(length(endpoint)<4096),p256dh text NOT NULL,auth_key text NOT NULL,
 language text NOT NULL DEFAULT 'en' CHECK(language IN('en','ar','fa')),enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(endpoint,restaurant_id)
);
CREATE TABLE public.wallet_push_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL REFERENCES public.erp_bank_wallet_requests(id) ON DELETE CASCADE,
 restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 recipient_role text NOT NULL CHECK(recipient_role IN('owner','beneficiary')),
 status text NOT NULL CHECK(status IN('pending','posted','rejected')),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(request_id,status,recipient_id)
);
CREATE TABLE public.wallet_push_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL REFERENCES public.wallet_push_events(id) ON DELETE CASCADE,
 device_id uuid NOT NULL REFERENCES public.wallet_push_devices(id) ON DELETE CASCADE,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','sending','sent','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT now(),last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(event_id,device_id)
);
CREATE INDEX wallet_push_due ON public.wallet_push_deliveries(available_at) WHERE state IN('pending','sending');
CREATE INDEX wallet_push_recipient ON public.wallet_push_events(recipient_id,created_at DESC);
ALTER TABLE public.wallet_push_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_push_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wallet_push_devices,public.wallet_push_events,public.wallet_push_deliveries FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.wallet_push_devices,public.wallet_push_events,public.wallet_push_deliveries TO service_role;
CREATE POLICY wallet_push_devices_service ON public.wallet_push_devices FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE POLICY wallet_push_events_service ON public.wallet_push_events FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE POLICY wallet_push_deliveries_service ON public.wallet_push_deliveries FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE FUNCTION public.wallet_push_can_access(p_user uuid,p_restaurant uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.restaurants WHERE id=p_restaurant AND coalesce(is_active,true)) AND (
 EXISTS(SELECT 1 FROM public.erp_memberships WHERE user_id=p_user AND restaurant_id=p_restaurant AND role='owner' AND status='approved') OR
 EXISTS(SELECT 1 FROM public.business_partners WHERE user_id=p_user AND restaurant_id=p_restaurant AND is_active));
$$;
REVOKE ALL ON FUNCTION public.wallet_push_can_access(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_push_can_access(uuid,uuid) TO service_role;
CREATE FUNCTION public.wallet_push_register(p_user uuid,p_restaurant uuid,p_subscription jsonb,p_language text) RETURNS uuid
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
 IF NOT public.wallet_push_can_access(p_user,p_restaurant) THEN RAISE EXCEPTION 'WALLET_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('wallet-push:'||(p_subscription->>'endpoint'),0));
 IF EXISTS(SELECT 1 FROM public.wallet_push_devices WHERE endpoint=p_subscription->>'endpoint' AND user_id<>p_user) THEN
 RAISE EXCEPTION 'PUSH_DEVICE_ACCOUNT_CONFLICT' USING ERRCODE='42501';END IF;
 INSERT INTO public.wallet_push_devices(user_id,restaurant_id,endpoint,p256dh,auth_key,language)
 VALUES(p_user,p_restaurant,p_subscription->>'endpoint',p_subscription->'keys'->>'p256dh',p_subscription->'keys'->>'auth',p_language)
 ON CONFLICT(endpoint,restaurant_id) DO UPDATE SET enabled=true,p256dh=excluded.p256dh,auth_key=excluded.auth_key,language=excluded.language
 WHERE wallet_push_devices.user_id=p_user RETURNING id INTO v_id;
 RETURN v_id;
END;$$;
REVOKE ALL ON FUNCTION public.wallet_push_register(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_push_register(uuid,uuid,jsonb,text) TO service_role;
-- Existing owners already opted into device notifications; retain the same device/language.
INSERT INTO public.wallet_push_devices(user_id,restaurant_id,endpoint,p256dh,auth_key,language)
 SELECT d.user_id,d.restaurant_id,d.endpoint,d.p256dh,d.auth_key,coalesce(d.language,'en') FROM public.owner_push_devices d
 WHERE d.enabled AND public.wallet_push_can_access(d.user_id,d.restaurant_id);
CREATE FUNCTION push_private.capture_wallet() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND (OLD.status=NEW.status OR NEW.status NOT IN('posted','rejected')) THEN RETURN NEW;END IF;
 IF TG_OP='INSERT' AND NEW.status<>'pending' THEN RETURN NEW;END IF;
 IF NEW.status='pending' AND NOT NEW.initiated_by_owner THEN
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
REVOKE ALL ON FUNCTION push_private.capture_wallet() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER wallet_push_capture AFTER INSERT OR UPDATE OF status ON public.erp_bank_wallet_requests
 FOR EACH ROW EXECUTE FUNCTION push_private.capture_wallet();
CREATE FUNCTION public.wallet_push_claim() RETURNS SETOF public.wallet_push_deliveries
LANGUAGE sql SET search_path='' AS $$
 WITH picked AS(SELECT id FROM public.wallet_push_deliveries WHERE state IN('pending','sending') AND available_at<=now()
 AND attempts<8 AND created_at>now()-interval '24 hours' ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 40)
 UPDATE public.wallet_push_deliveries d SET state='sending',attempts=attempts+1,available_at=now()+interval '5 minutes'
 FROM picked p WHERE d.id=p.id RETURNING d.*;
$$;
REVOKE ALL ON FUNCTION public.wallet_push_claim() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_push_claim() TO service_role;
CREATE FUNCTION push_private.wallet_dispatch() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE secret text;
BEGIN
 UPDATE public.wallet_push_deliveries SET state='failed',last_error='Delivery expired or retries exhausted'
 WHERE state IN('pending','sending') AND available_at<=now() AND (attempts>=8 OR created_at<now()-interval '24 hours');
 IF NOT EXISTS(SELECT 1 FROM public.wallet_push_deliveries WHERE state IN('pending','sending') AND available_at<=now()) THEN RETURN;END IF;
 SELECT decrypted_secret::jsonb->>'dispatchSecret' INTO secret FROM vault.decrypted_secrets WHERE name='owner_push_config';
 IF secret IS NULL THEN RETURN;END IF;
 PERFORM net.http_post(url:='https://mqubwgbppncldyiicbtu.supabase.co/functions/v1/wallet-push/dispatch',
 headers:=jsonb_build_object('Content-Type','application/json','x-dispatch-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=55000);
END;$$;
REVOKE ALL ON FUNCTION push_private.wallet_dispatch() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('wallet-push-dispatch','10 seconds','select push_private.wallet_dispatch()');
SELECT cron.schedule('wallet-push-retention','29 3 * * *',$job$DELETE FROM public.wallet_push_events WHERE created_at<now()-interval '30 days'$job$);
-- Exact record lookup enforces the same tenant/person boundary as the wallet itself.
CREATE FUNCTION public.erp_wallet_push_record(p_request uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.erp_bank_wallet_requests;p public.business_partners;v_owner boolean;v_business text;v_after numeric;v_delta numeric;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'WALLET_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM public.erp_bank_wallet_requests WHERE id=p_request;
 IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM public.business_partners WHERE id=r.person_id AND restaurant_id=r.restaurant_id AND is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 v_owner:=coalesce(public.treasury_account_is_owner(r.restaurant_id),false);
 IF (NOT v_owner AND p.user_id IS DISTINCT FROM auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.restaurants WHERE id=r.restaurant_id AND coalesce(is_active,true)) THEN
 RAISE EXCEPTION 'WALLET_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT name INTO v_business FROM public.restaurants WHERE id=r.restaurant_id;
 SELECT j.signed_amount,(SELECT sum(x.signed_amount) FROM public.erp_bank_wallet_postings x WHERE x.wallet_account_id=j.wallet_account_id AND x.side='person' AND (x.posted_at,x.id)<=(j.posted_at,j.id))
 INTO v_delta,v_after FROM public.erp_bank_wallet_postings j WHERE j.request_id=r.id AND j.side='person';
 RETURN jsonb_build_object('id',r.id,'person_id',r.person_id,'restaurant_id',r.restaurant_id,'is_owner',v_owner,'kind',r.kind,
 'amount',r.amount,'currency',r.currency,'status',r.status,'note',r.note,'review_note',r.review_note,'initiated_by_owner',r.initiated_by_owner,
 'created_at',r.created_at,'reviewed_at',r.reviewed_at,'person_name',p.name,'business_name',v_business,
 'payer',CASE WHEN r.kind='fund_wallet' THEN v_business ELSE p.name END,'payee',CASE WHEN r.kind='fund_wallet' THEN p.name ELSE v_business END,
 'balance_before',v_after-v_delta,'balance_after',v_after);
END;$$;
REVOKE ALL ON FUNCTION public.erp_wallet_push_record(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_wallet_push_record(uuid) TO authenticated;
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
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'email','wallet-owner-qa-'||u||'@example.invalid','role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',40,'SAR',tx,cash,'Owner funding QA');
 PERFORM public.erp_bank_wallet_owner_transfer(person,'fund_wallet',40,'SAR',tx,cash,'Owner funding QA');


 RESET ROLE;
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
 OR (e.status<>'pending' AND e.recipient_id<>q.created_by))),'wrong notification recipient';
 ASSERT NOT EXISTS(SELECT 1 FROM public.wallet_push_events WHERE restaurant_id=tenant GROUP BY request_id,status,recipient_id HAVING count(*)>1),'duplicate event';
 ASSERT NOT has_function_privilege('authenticated','public.wallet_push_claim()','execute'),'client can claim queue';
 ASSERT NOT has_function_privilege('authenticated','public.wallet_push_register(uuid,uuid,jsonb,text)','execute'),'client bypasses registration checks';
 ASSERT NOT has_table_privilege('authenticated','public.wallet_push_devices','select'),'device keys exposed';
 ASSERT NOT has_table_privilege('authenticated','public.wallet_push_events','select'),'recipient events exposed';
 ASSERT NOT has_function_privilege('anon','public.erp_wallet_push_record(uuid)','execute'),'anonymous deep links';
 ASSERT NOT has_function_privilege('anon','public.erp_bank_wallet_owner_transfer(uuid,text,numeric,text,uuid,uuid,text)','execute'),'anonymous grant';
END;
  RAISE EXCEPTION 'rollback push fixtures' USING ERRCODE='ZX001';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
END $validation$;
