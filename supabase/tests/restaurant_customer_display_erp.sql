-- Execute only inside BEGIN; ... ROLLBACK; fixtures are synthetic and discarded.
do $test$
declare
 owner_id uuid:=gen_random_uuid();
 tenant uuid;branch uuid;dev uuid;second_dev uuid;shift_id uuid;
 order_id uuid;other_order uuid;order_num bigint;
 token text:=repeat('a',64); snapshot jsonb;
 denied boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(
  owner_id,'restaurant-display-qa-'||owner_id||'@example.invalid',
  '{"role":"owner","business_type":"restaurant","full_name":"Customer Screen QA","company_name":"QA Restaurant","branch_name":"QA Branch"}'::jsonb
 );
 select restaurant_id,branch_id into tenant,branch from public.erp_memberships where user_id=owner_id;
 if tenant is null or branch is null then raise exception 'RESTAURANT_QA_OWNER_MISSING';end if;
 insert into public.subscriptions(restaurant_id,subscription_status,plan,trial_end)
  values(tenant,'TRIAL','growth_40',current_date+7)
  on conflict(restaurant_id) where restaurant_id is not null
  do update set subscription_status='TRIAL',plan='growth_40',trial_end=current_date+7;
 insert into restaurant_pos_private.terminals(restaurant_id,branch_id,code) values
 (tenant,branch,'DISPLAY-QA-01') returning id into dev;
 insert into restaurant_pos_private.shifts(device_id,cashier_id,cashier_name,opening_cash)
  values(dev,owner_id,'QA Cashier',0) returning id into shift_id;
 insert into restaurant_pos_private.orders(device_id,shift_id,status,kitchen_status,
  submitted_at,lines,net_total,tax_total,subtotal)
 values(dev,shift_id,'held','queued',now(),
 '[{"name":"Chicken","name_ar":"دجاج","name_fa":"مرغ","quantity":2,"unit_price":22,"line_total":44,"recipe":[{"inventory_id":"secret"}]}]'::jsonb,
 44,4,40) returning id,number into order_id,order_num;
 insert into restaurant_pos_private.displays(device_id,token_hash,topic,expires_at,order_id)
 values(dev,encode(extensions.digest(token,'sha256'),'hex'),gen_random_uuid(),now()+interval '8 hours',order_id);
 set local role anon;
 snapshot:=public.erp_restaurant_customer_display(token);
 if snapshot->>'kitchen_status'<>'queued' or (snapshot->>'number')::bigint<>order_num
  or (snapshot->>'net_total')::numeric<>44
  or snapshot->'lines'->0->>'name_fa'<>'مرغ'
  or snapshot::text like '%inventory_id%' or snapshot::text like '%cashier_id%'
  or snapshot::text like '%"recipe"%' then
  raise exception 'ERP_DISPLAY_STAGE_TOTAL_OR_PRIVACY_INVALID: %',snapshot;
 end if;
 reset role;
 update restaurant_pos_private.orders set kitchen_status='preparing' where id=order_id;
 set local role anon;
 snapshot:=public.erp_restaurant_customer_display(token);
 if snapshot->>'kitchen_status'<>'preparing' then raise exception 'KITCHEN_STAGE_STALE';end if;
 reset role;
 insert into restaurant_pos_private.terminals(restaurant_id,branch_id,code)
  values(tenant,branch,'DISPLAY-QA-02') returning id into second_dev;
 insert into restaurant_pos_private.shifts(device_id,cashier_id,cashier_name,opening_cash)
  values(second_dev,owner_id,'QA Second Cashier',0) returning id into shift_id;
 insert into restaurant_pos_private.orders(device_id,shift_id,status,lines,net_total)
  values(second_dev,shift_id,'open','[{"name":"SHOULD NOT LEAK"}]'::jsonb,990)
  returning id into other_order;
 update restaurant_pos_private.displays set order_id=other_order where device_id=dev;
 set local role anon;
 snapshot:=public.erp_restaurant_customer_display(token);
 if snapshot->>'number' is not null or snapshot->>'net_total' is not null
  or jsonb_array_length(snapshot->'lines')<>0
  then raise exception 'CROSS_DEVICE_ORDER_DISCLOSED: %',snapshot;end if;
 reset role;
 update restaurant_pos_private.displays set order_id=null where device_id=dev;
 set local role anon;
 snapshot:=public.erp_restaurant_customer_display(token);
 if snapshot->>'number' is not null or snapshot->>'net_total' is not null
 then raise exception 'EMPTY_SCREEN_FALSE_SALES';end if;
 reset role;
 update restaurant_pos_private.shifts set closed_at=now() where device_id=dev;
 set local role anon;
 denied:=false;
 begin perform public.erp_restaurant_customer_display(token);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'CLOSED_SHIFT_LINK_STILL_VISIBLE';end if;
 reset role;
end
$test$;
