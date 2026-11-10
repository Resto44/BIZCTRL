-- Run in an outer BEGIN...ROLLBACK. All fixtures are synthetic and discarded.
do $test$
declare own uuid:=gen_random_uuid(); tenant uuid; branch uuid; dev uuid; shift uuid; oid uuid;
 p jsonb; p2 jsonb; v jsonb; denied boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data)
  values(own,'tv-test-'||own||'@example.invalid',
   '{"role":"owner","business_type":"restaurant","full_name":"TV QA","company_name":"TV Fixture","branch_name":"TV QA Branch"}'::jsonb);
 select restaurant_id,branch_id into tenant,branch from public.erp_memberships where user_id=own;
 if tenant is null or branch is null then raise exception 'MISSING_TEST_OWNER'; end if;
 insert into public.subscriptions(restaurant_id,subscription_status,plan,trial_end)
  values(tenant,'TRIAL','growth_40',current_date+7)
  on conflict(restaurant_id) where restaurant_id is not null do update
   set subscription_status='TRIAL',plan='growth_40',trial_end=current_date+7;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',own,'role','authenticated')::text,true);
 set local role authenticated;
 p:=public.erp_restaurant_customer_tracking_manage(tenant,branch,'pair');
 if length(p->>'token')<>64 then raise exception 'NO_PAIR_TOKEN'; end if;
 denied:=false;
 begin perform public.erp_restaurant_customer_tracking_manage(tenant,gen_random_uuid(),'pair');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'CROSS_BRANCH_PAIR_ALLOWED';end if;
 reset role;
 set local role anon;
 v:=public.erp_restaurant_customer_tracking_display(p->>'token');
 if jsonb_array_length(v->'orders')<>0 then raise exception 'NONEMPTY_TEST_BRANCH';end if;
 reset role;

 insert into restaurant_pos_private.terminals(restaurant_id,branch_id,code)
  values(tenant,branch,'QA-TV-'||left(own::text,6)) returning id into dev;
 insert into restaurant_pos_private.shifts(device_id,cashier_id,cashier_name,opening_cash)
  values(dev,own,'TV TEST',0) returning id into shift;
 insert into restaurant_pos_private.orders(device_id,shift_id,number,status,kitchen_status,submitted_at,lines,notes)
  overriding system value
  values(dev,shift,990000000+floor(random()*100000)::bigint,'held','queued',now(),
   '[{"name":"PRIVATE FOOD","quantity":2}]'::jsonb,'PRIVATE NOTE') returning id into oid;
 set local role anon;
 v:=public.erp_restaurant_customer_tracking_display(p->>'token');
 if (v->'counts'->>'queued')::int<>1 or jsonb_array_length(v->'orders')<>1
  or v::text like '%PRIVATE%' or v ? 'cash_paid' then raise exception 'LEAK_OR_QUEUE_MISMATCH';end if;
 reset role;
 update restaurant_pos_private.orders set kitchen_status='preparing' where id=oid;
 set local role anon;
 v:=public.erp_restaurant_customer_tracking_display(p->>'token');
 if v->'orders'->0->>'stage'<>'preparing' then raise exception 'KITCHEN_UPDATE_NOT_VISIBLE';end if;
 reset role;

 set local role authenticated;
 p2:=public.erp_restaurant_customer_tracking_manage(tenant,branch,'pair');
 reset role;
 set local role anon;
 denied:=false;
 begin perform public.erp_restaurant_customer_tracking_display(p->>'token');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'OLD_TOKEN_VALID';end if;
 reset role;

 set local role authenticated;
 perform public.erp_restaurant_customer_tracking_manage(tenant,branch,'revoke');
 reset role;
 set local role anon;
 denied:=false;
 begin perform public.erp_restaurant_customer_tracking_display(p2->>'token');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'REVOKED_TOKEN_VALID';end if;
 reset role;
end $test$;
