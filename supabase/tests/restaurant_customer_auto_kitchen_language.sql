-- Execute in BEGIN; .. ROLLBACK. No user or order records persist.
do $regression$
declare
  owner_id uuid:=gen_random_uuid();
  tenant_id uuid; v_branch uuid; cashier_device uuid; other_device uuid;
  shift_id uuid; other_shift uuid; kitchen_order uuid; blank_cart uuid; foreign_order uuid;
  first_number bigint; blank_number bigint; active_token text:=repeat('e',64);
  queue_token text:=repeat('f',64); response jsonb;
  denied boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data)
  values(owner_id,'kitchen-auto-regression-'||owner_id||'@example.invalid',
   '{"role":"owner","business_type":"restaurant","full_name":"Auto KDS QA","company_name":"Auto Kitchen Test","branch_name":"Test Branch"}'::jsonb);
 select m.restaurant_id,m.branch_id into tenant_id,v_branch
   from public.erp_memberships m where m.user_id=owner_id;
 if tenant_id is null or v_branch is null then raise exception 'FIXTURE_OWNER_NOT_CREATED';end if;
 insert into public.subscriptions(restaurant_id,subscription_status,plan,trial_end)
 values(tenant_id,'TRIAL','growth_40',current_date+7)
 on conflict(restaurant_id) where restaurant_id is not null
 do update set subscription_status='TRIAL',plan='growth_40',trial_end=current_date+7;
 insert into restaurant_pos_private.terminals(restaurant_id,branch_id,code)
 values(tenant_id,v_branch,'AUTO-KDS-TEST-1') returning id into cashier_device;
 insert into restaurant_pos_private.terminals(restaurant_id,branch_id,code)
 values(tenant_id,v_branch,'AUTO-KDS-TEST-2') returning id into other_device;
 insert into restaurant_pos_private.shifts(device_id,cashier_id,cashier_name,opening_cash)
 values(cashier_device,owner_id,'Test A',0) returning id into shift_id;
 insert into restaurant_pos_private.shifts(device_id,cashier_id,cashier_name,opening_cash)
 values(other_device,owner_id,'Test B',0) returning id into other_shift;
 insert into restaurant_pos_private.orders(device_id,shift_id,status,kitchen_status,submitted_at,lines,subtotal,tax_total,net_total)
 values(cashier_device,shift_id,'paid','preparing',now()-interval '5 minutes',
   '[{"name":"Chicken","name_ar":"دجاج","name_fa":"مرغ","quantity":2,"line_total":44}]'::jsonb,40,4,44)
 returning id,number into kitchen_order,first_number;
 insert into restaurant_pos_private.orders(device_id,shift_id,status,kitchen_status,lines)
 values(cashier_device,shift_id,'open','draft','[]'::jsonb)
 returning id,number into blank_cart,blank_number;
 insert into restaurant_pos_private.orders(device_id,shift_id,status,kitchen_status,submitted_at,lines,net_total)
 values(other_device,other_shift,'paid','ready',now(),
  '[{"name":"OTHER CUSTOMER FOOD","quantity":1}]'::jsonb,500)
 returning id into foreign_order;

 insert into restaurant_pos_private.displays(device_id,token_hash,topic,expires_at,order_id)
 values(cashier_device,encode(extensions.digest(active_token,'sha256'),'hex'),
   gen_random_uuid(),now()+interval '8 hours',blank_cart);
 insert into restaurant_pos_private.customer_tracking_displays(
  restaurant_id,branch_id,token_hash,topic,expires_at)
 values(tenant_id,v_branch,encode(extensions.digest(queue_token,'sha256'),'hex'),gen_random_uuid(),now()+interval '8 hours');

 set local role anon;
 response:=public.erp_restaurant_customer_display(active_token);
 if (response->>'number')::bigint<>first_number or
   response->>'kitchen_status'<>'preparing' or
   response->>'display_mode'<>'kitchen' or
   jsonb_array_length(response->'lines')<>1 or
   (response->>'net_total')::numeric<>44 then
   raise exception 'DEFAULT_KITCHEN_FOLLOW_FAILED: %',response;
 end if;
 reset role;

 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 set local role authenticated;
 response:=public.erp_restaurant_kitchen_screen_language_get(tenant_id,v_branch);
 if response->>'configured'<>'false' or response->>'language' is not null then
   raise exception 'UNCONFIGURED_BRANCH_GET_MUST_NOT_WRITE_OR_GUESS';
 end if;
 response:=public.erp_restaurant_kitchen_screen_language(tenant_id,v_branch,'ar');
 if response->>'language'<>'ar' then raise exception 'KITCHEN_LANGUAGE_WRITE_FAILED'; end if;
 response:=public.erp_restaurant_kitchen_screen_language_get(tenant_id,v_branch);
 if response->>'language'<>'ar' or response->>'configured'<>'true' then
   raise exception 'KITCHEN_LANGUAGE_READ_DOES_NOT_FOLLOW_SAVED_PREF';
 end if;
 reset role;

 set local role anon;
 response:=public.erp_restaurant_customer_display(active_token);
 if response->>'kitchen_language'<>'ar' then
   raise exception 'PAIRED_SCREEN_DID_NOT_FOLLOW_LANGUAGE';
 end if;
 response:=public.erp_restaurant_customer_tracking_display(queue_token);
 if response->>'kitchen_language'<>'ar' then
   raise exception 'BRANCH_QUEUE_SCREEN_DID_NOT_FOLLOW_LANGUAGE';
 end if;
 denied:=false;
 begin
   perform public.erp_restaurant_kitchen_screen_language_get(tenant_id,v_branch);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'ANONYMOUS_READS_INTERNAL_KITCHEN_LANGUAGE';end if;
 denied:=false;
 begin
   perform public.erp_restaurant_kitchen_screen_language(tenant_id,v_branch,'fa');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'ANONYMOUS_CHANGED_KITCHEN_LANGUAGE';end if;
 reset role;

 update restaurant_pos_private.orders set kitchen_status='ready'
   where id=kitchen_order;
 set local role anon;
 response:=public.erp_restaurant_customer_display(active_token);
 if response->>'kitchen_status'<>'ready' or
   (response->>'number')::bigint<>first_number then
   raise exception 'KITCHEN_READY_NOT_REFLECTED';
 end if;
 reset role;
 -- In kitchen mode, completed orders leave the public screen.
 update restaurant_pos_private.orders set kitchen_status='served'
   where id=kitchen_order;
 set local role anon;
 response:=public.erp_restaurant_customer_display(active_token);
 if response->>'number' is not null or jsonb_array_length(response->'lines')<>0 or
   response->>'net_total' is not null then
    raise exception 'SERVED_ORDER_OR_BLANK_CART_SHOWN_AS_ACTIVE';
 end if;
 reset role;

 set local role authenticated;
 response:=public.erp_restaurant_pos_display_focus(cashier_device,'cart',null);
 if response->>'display_mode'<>'cart' then raise exception 'EXPLICIT_CART_MODE_FAILED';end if;
 reset role;
 set local role anon;
 response:=public.erp_restaurant_customer_display(active_token);
 if (response->>'number')::bigint<>blank_number then
   raise exception 'EXPLICIT_CART_DID_NOT_SHOW_CURRENT_CART';
 end if;
 reset role;

 set local role authenticated;
 response:=public.erp_restaurant_pos_display_focus(cashier_device,'auto',null);
 if response->>'display_mode'<>'kitchen' then
   raise exception 'RETURN_TO_AUTOMATIC_KITCHEN_FAILED';
 end if;
 denied:=false;
 begin
   perform public.erp_restaurant_pos_display_focus(cashier_device,'pin',foreign_order);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'CROSS_DEVICE_ORDER_PIN_ALLOWED';end if;
 reset role;
end $regression$;
